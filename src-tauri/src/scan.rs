//! Parallel directory walker.
//!
//! We use `std::fs::read_dir` + rayon instead of a generic walker because on
//! Windows each `DirEntry::metadata()` comes straight from the FindNextFile
//! data (no extra syscall per file), which is the hot path for a full-drive
//! scan. Each directory's subfolders are scanned in parallel.

use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

/// Cloud-only placeholder files (OneDrive "Files On-Demand") report their
/// full logical size but occupy no local space.
#[cfg(windows)]
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
#[cfg(windows)]
const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x0004_0000;
#[cfg(windows)]
const FILE_ATTRIBUTE_OFFLINE: u32 = 0x0000_1000;
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

#[derive(Serialize, Clone, Debug)]
pub struct Node {
    pub name: String,
    pub path: String,
    /// Total bytes under this node.
    pub size: u64,
    pub is_dir: bool,
    /// Children at or above the size threshold, largest first.
    pub children: Vec<Node>,
    /// Bytes in files and subfolders below the threshold.
    pub other: u64,
    /// How many items were folded into `other`.
    pub other_count: u64,
    /// Number of files under this node.
    pub files: u64,
}

#[derive(Default)]
pub struct Counters {
    pub files: AtomicU64,
    pub dirs: AtomicU64,
    pub bytes: AtomicU64,
    pub errors: AtomicU64,
    pub current: Mutex<String>,
    pub cancel: AtomicBool,
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Bytes a file actually uses locally (0 for cloud-only placeholders).
fn local_len(md: &fs::Metadata) -> u64 {
    #[cfg(windows)]
    {
        let a = md.file_attributes();
        if a & (FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_OFFLINE) != 0 {
            return 0;
        }
    }
    md.len()
}

/// Should we descend into this directory entry? Skips symlinks, junctions
/// and other reparse-point directories so nothing is counted twice.
fn is_walkable_dir(ft: &fs::FileType, md: Option<&fs::Metadata>) -> bool {
    if ft.is_symlink() || !ft.is_dir() {
        return false;
    }
    #[cfg(windows)]
    if let Some(md) = md {
        if md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return false;
        }
    }
    let _ = md;
    true
}

/// Scan `path` recursively. Children smaller than `min` are folded into the
/// parent's `other` bucket as soon as their size is known, so memory stays
/// small even for millions of files.
pub fn scan_dir(path: &Path, min: u64, c: &Counters) -> Node {
    let mut node = Node {
        name: name_of(path),
        path: path.to_string_lossy().into_owned(),
        size: 0,
        is_dir: true,
        children: Vec::new(),
        other: 0,
        other_count: 0,
        files: 0,
    };
    c.dirs.fetch_add(1, Relaxed);
    if c.cancel.load(Relaxed) {
        return node;
    }
    let rd = match fs::read_dir(path) {
        Ok(r) => r,
        Err(_) => {
            // Access denied (System Volume Information, other users, ...).
            c.errors.fetch_add(1, Relaxed);
            return node;
        }
    };

    let mut subdirs = Vec::new();
    let mut local_bytes = 0u64;
    let mut local_files = 0u64;
    for entry in rd.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        let md = entry.metadata().ok();
        if ft.is_dir() {
            if is_walkable_dir(&ft, md.as_ref()) {
                subdirs.push(entry.path());
            }
            continue;
        }
        if ft.is_symlink() {
            continue;
        }
        let Some(md) = md else { continue };
        let len = local_len(&md);
        local_bytes += len;
        local_files += 1;
        if len >= min {
            node.children.push(Node {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size: len,
                is_dir: false,
                children: Vec::new(),
                other: 0,
                other_count: 0,
                files: 1,
            });
        } else {
            node.other += len;
            node.other_count += 1;
        }
    }
    c.files.fetch_add(local_files, Relaxed);
    c.bytes.fetch_add(local_bytes, Relaxed);
    if let Ok(mut cur) = c.current.try_lock() {
        cur.clone_from(&node.path);
    }

    let subs: Vec<Node> = subdirs.par_iter().map(|p| scan_dir(p, min, c)).collect();

    node.size = local_bytes;
    node.files = local_files;
    for s in subs {
        node.size += s.size;
        node.files += s.files;
        if s.size >= min {
            node.children.push(s);
        } else {
            node.other += s.size;
            node.other_count += 1;
        }
    }
    node.children.sort_by(|a, b| b.size.cmp(&a.size));
    node
}

/// Total size and file count of a file or folder (no tree kept).
pub fn measure(path: &Path) -> (u64, u64) {
    let Ok(md) = fs::symlink_metadata(path) else { return (0, 0) };
    if md.is_file() {
        return (local_len(&md), 1);
    }
    let c = Counters::default();
    let n = scan_dir(path, u64::MAX, &c);
    (n.size, n.files)
}
