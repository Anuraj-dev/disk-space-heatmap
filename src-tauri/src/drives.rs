use serde::Serialize;
use sysinfo::Disks;

#[derive(Serialize)]
pub struct DriveInfo {
    /// e.g. "C:\"
    pub mount: String,
    /// Volume label, may be empty.
    pub name: String,
    pub fs: String,
    pub total: u64,
    pub free: u64,
    pub removable: bool,
}

pub fn list() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<DriveInfo> = disks
        .list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| DriveInfo {
            mount: d.mount_point().to_string_lossy().into_owned(),
            name: d.name().to_string_lossy().into_owned(),
            fs: d.file_system().to_string_lossy().into_owned(),
            total: d.total_space(),
            free: d.available_space(),
            removable: d.is_removable(),
        })
        .collect();
    out.sort_by(|a, b| a.mount.cmp(&b.mount));
    out.dedup_by(|a, b| a.mount == b.mount);
    out
}
