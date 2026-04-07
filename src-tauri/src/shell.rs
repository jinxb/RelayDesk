use crate::models::{DirectoryPickerRequest, PathRequest, ShellIdentity, MAIN_WINDOW_LABEL};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager, Runtime};

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Unable to locate the main RelayDesk window.".to_string())
}

fn require_existing_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if candidate.exists() {
        return Ok(candidate);
    }
    Err(format!("Path does not exist: {}", candidate.display()))
}

fn run_command(command: &str, args: &[String]) -> Result<(), String> {
    Command::new(command)
        .args(args)
        .spawn()
        .map_err(|error| format!("Unable to launch {command}: {error}"))?;
    Ok(())
}

fn quote_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "windows")]
fn quote_powershell(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "macos")]
fn open_path_system(path: &Path) -> Result<(), String> {
    run_command("open", &[path.display().to_string()])
}

#[cfg(target_os = "windows")]
fn open_path_system(path: &Path) -> Result<(), String> {
    run_command("explorer", &[path.display().to_string()])
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_path_system(path: &Path) -> Result<(), String> {
    run_command("xdg-open", &[path.display().to_string()])
}

#[cfg(target_os = "macos")]
fn reveal_path_system(path: &Path) -> Result<(), String> {
    run_command("open", &["-R".to_string(), path.display().to_string()])
}

#[cfg(target_os = "windows")]
fn reveal_path_system(path: &Path) -> Result<(), String> {
    run_command("explorer", &[format!("/select,{}", path.display())])
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn reveal_path_system(path: &Path) -> Result<(), String> {
    let target = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };
    open_path_system(&target)
}

#[cfg(target_os = "macos")]
fn pick_directory_system(request: &DirectoryPickerRequest) -> Result<Option<String>, String> {
    let mut chooser = "set chosenFolder to choose folder".to_string();
    if let Some(title) = request.title.as_deref() {
        chooser.push_str(&format!(" with prompt \"{}\"", quote_applescript(title)));
    }
    if let Some(path) = request.starting_path.as_deref() {
        chooser.push_str(&format!(
            " default location POSIX file \"{}\"",
            quote_applescript(path)
        ));
    }

    let script = format!(
        "try\n{}\nPOSIX path of chosenFolder\non error number -128\nreturn \"\"\nend try",
        chooser
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Unable to open the macOS folder picker: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        return Ok(None);
    }
    Ok(Some(selected))
}

#[cfg(target_os = "windows")]
fn pick_directory_system(request: &DirectoryPickerRequest) -> Result<Option<String>, String> {
    let title = quote_powershell(request.title.as_deref().unwrap_or("Select a folder"));
    let starting_path = quote_powershell(request.starting_path.as_deref().unwrap_or(""));
    let script = format!(
        "Add-Type -AssemblyName System.Windows.Forms; \
         $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; \
         $dialog.Description = '{title}'; \
         if ('{starting_path}' -ne '') {{ $dialog.SelectedPath = '{starting_path}' }}; \
         if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $dialog.SelectedPath }}"
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Sta", "-Command", &script])
        .output()
        .map_err(|error| format!("Unable to open the Windows folder picker: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        return Ok(None);
    }
    Ok(Some(selected))
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn pick_directory_system(request: &DirectoryPickerRequest) -> Result<Option<String>, String> {
    let mut command = Command::new("zenity");
    command.args(["--file-selection", "--directory"]);
    if let Some(title) = request.title.as_deref() {
        command.arg(format!("--title={title}"));
    }
    if let Some(path) = request.starting_path.as_deref() {
        command.arg(format!("--filename={path}"));
    }

    let output = command
        .output()
        .map_err(|error| format!("Unable to open the Linux folder picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.trim().is_empty() {
            return Ok(None);
        }
        return Err(stderr.trim().to_string());
    }

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        return Ok(None);
    }
    Ok(Some(selected))
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    let _ = window.unminimize();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    window.hide().map_err(|error| error.to_string())
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    let is_visible = window.is_visible().map_err(|error| error.to_string())?;
    if is_visible {
        return window.hide().map_err(|error| error.to_string());
    }

    let _ = window.unminimize();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn shell_identity() -> ShellIdentity<'static> {
    ShellIdentity::current()
}

#[tauri::command]
pub fn window_show(app: AppHandle) -> Result<(), String> {
    show_main_window(&app)
}

#[tauri::command]
pub fn window_hide(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[tauri::command]
pub fn open_path(request: PathRequest) -> Result<(), String> {
    let path = require_existing_path(&request.path)?;
    open_path_system(&path)
}

#[tauri::command]
pub fn reveal_path(request: PathRequest) -> Result<(), String> {
    let path = require_existing_path(&request.path)?;
    reveal_path_system(&path)
}

#[tauri::command]
pub fn pick_directory(request: DirectoryPickerRequest) -> Result<Option<String>, String> {
    pick_directory_system(&request)
}
