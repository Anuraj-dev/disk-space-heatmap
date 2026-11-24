use crate::scan;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Rule {
    pub id: String,
    pub app: String,
    pub title: String,
    pub paths: Vec<String>,
    pub verdict: String,
    pub explanation: String,
    pub how_to_free: String,
    #[serde(default)]
    pub action: Option<String>,
}

#[derive(Deserialize)]
struct RuleFile {
    rules: Vec<Rule>,
}

#[derive(Serialize)]
pub struct CleanupItem {
    pub rule: Rule,
    pub path: String,
    pub size: u64,
    pub files: u64,
    pub can_delete: bool,
}

#[derive(Serialize)]
pub struct CleanResult {
    pub freed: u64,
    pub failed: u64,
}

pub fn all() -> Vec<Rule> {
    let f: RuleFile = serde_json::from_str(include_str!("../rules.json")).expect("rules.json is invalid");
    f.rules
}

/// "C:\" or "C:" or "c" -> "C:"
pub fn drive_prefix(drive: &str) -> String {
    let letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();
    format!("{letter}:")
}

fn expand_env(s: &str, drive: &str) -> Option<String> {
    let s = s.replace("{DRIVE}", drive);
    let mut out = String::new();
    let mut rest = s.as_str();
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let j = after.find('%')?;
        out.push_str(&std::env::var(&after[..j]).ok()?);
        rest = &after[j + 1..];
    }
    out.push_str(rest);
    Some(out)
}

fn wild_match(pat: &[u8], s: &[u8]) -> bool {
    match (pat.first(), s.first()) {
        (None, None) => true,
        (Some(b'*'), _) => wild_match(&pat[1..], s) || (!s.is_empty() && wild_match(pat, &s[1..])),
        (Some(p), Some(c)) if p.eq_ignore_ascii_case(c) => wild_match(&pat[1..], &s[1..]),
        _ => false,
    }
}

/// Expand one rule pattern into existing paths.
fn resolve(pattern: &str, drive: &str) -> Vec<PathBuf> {
    let Some(expanded) = expand_env(pattern, drive) else { return vec![] };
    let parts: Vec<&str> = expanded.split('\\').filter(|p| !p.is_empty()).collect();
    let Some(first) = parts.first() else { return vec![] };
    let mut cur = vec![PathBuf::from(format!("{first}\\"))];
    for part in &parts[1..] {
        let mut next = Vec::new();
        for base in cur {
            if part.contains('*') {
                if let Ok(rd) = fs::read_dir(&base) {
                    for e in rd.flatten() {
                        if wild_match(part.as_bytes(), e.file_name().to_string_lossy().as_bytes()) {
                            next.push(e.path());
                        }
                    }
                }
            } else {
                let p = base.join(part);
                // metadata may fail for locked system files (pagefile); fall back to parent listing.
                if fs::symlink_metadata(&p).is_ok() || exists_in_listing(&base, part) {
                    next.push(p);
                }
            }
        }
        cur = next;
    }
    cur
}

fn exists_in_listing(dir: &Path, name: &str) -> bool {
    fs::read_dir(dir)
        .map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().eq_ignore_ascii_case(name)))
        .unwrap_or(false)
}

/// All existing paths for a rule on the given drive (deduplicated).
pub fn rule_paths(rule: &Rule, drive: &str) -> Vec<PathBuf> {
    let drive = drive_prefix(drive);
    let mut out: Vec<PathBuf> = Vec::new();
    for pat in &rule.paths {
        for p in resolve(pat, &drive) {
            let s = p.to_string_lossy().to_uppercase();
            if !s.starts_with(&drive) {
                continue;
            }
            if !out.iter().any(|o| o.to_string_lossy().eq_ignore_ascii_case(&p.to_string_lossy())) {
                out.push(p);
            }
        }
    }
    out
}

pub fn can_delete(rule: &Rule) -> bool {
    rule.verdict == "safe" && rule.action.is_some()
}

pub fn find(drive: &str) -> Vec<CleanupItem> {
    let mut items = Vec::new();
    for rule in all() {
        for p in rule_paths(&rule, drive) {
            let (size, files) = scan::measure(&p);
            // Hide near-empty caches (e.g. a bin holding only desktop.ini).
            if size < 1024 * 1024 && rule.verdict != "keep" {
                continue;
            }
            items.push(CleanupItem {
                can_delete: can_delete(&rule),
                rule: rule.clone(),
                path: p.to_string_lossy().into_owned(),
                size,
                files,
            });
        }
    }
    items.sort_by_key(|a| std::cmp::Reverse(a.size));
    items
}

/// Delete the contents of `path` for `rule_id`. The path must be one this
/// backend resolved for that rule itself; the frontend can't point it
/// anywhere else.
pub fn clean(rule_id: &str, path: &str) -> Result<CleanResult, String> {
    let rule = all().into_iter().find(|r| r.id == rule_id).ok_or("Unknown rule")?;
    if !can_delete(&rule) {
        return Err("This item is not marked safe to delete automatically.".into());
    }
    let target = rule_paths(&rule, path)
        .into_iter()
        .find(|p| p.to_string_lossy().eq_ignore_ascii_case(path))
        .ok_or("Path does not belong to this rule")?;

    let (before, _) = scan::measure(&target);
    let mut failed = 0u64;
    match rule.action.as_deref() {
        Some("empty_recycle_bin") => empty_recycle_bin(&drive_prefix(path))?,
        Some("delete_contents") => {
            let rd = fs::read_dir(&target).map_err(|e| format!("Can't open folder: {e}"))?;
            for e in rd.flatten() {
                let p = e.path();
                let is_real_dir = e.file_type().map(|t| t.is_dir() && !t.is_symlink()).unwrap_or(false);
                // remove_dir_all does not follow symlinks/junctions.
                let r = if is_real_dir { fs::remove_dir_all(&p) } else { fs::remove_file(&p) };
                if r.is_err() {
                    failed += 1; // in use or access denied: skip
                }
            }
        }
        _ => return Err("No cleanup action for this rule".into()),
    }
    let (after, _) = scan::measure(&target);
    Ok(CleanResult { freed: before.saturating_sub(after), failed })
}

#[cfg(windows)]
fn empty_recycle_bin(drive: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::SHEmptyRecycleBinW;
    let root: Vec<u16> = format!("{drive}\\").encode_utf16().chain(std::iter::once(0)).collect();
    // SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND (we confirm in-app).
    let hr = unsafe { SHEmptyRecycleBinW(std::ptr::null_mut(), root.as_ptr(), 0x7) };
    // S_OK, or E_UNEXPECTED when the bin is already empty.
    if hr >= 0 || hr as u32 == 0x8000_FFFF {
        Ok(())
    } else {
        Err(format!("Emptying the Recycle Bin failed (0x{:08X})", hr as u32))
    }
}

#[cfg(not(windows))]
fn empty_recycle_bin(_drive: &str) -> Result<(), String> {
    Err("Only supported on Windows".into())
}
