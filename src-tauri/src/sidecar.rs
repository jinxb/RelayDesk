use crate::models::{SidecarHttpRequest, SidecarRpcResponse, SidecarSnapshot};
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Manager, Runtime, State};

const MAX_STDERR_TAIL_BYTES: usize = 8 * 1024;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct SidecarProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr_tail: Arc<Mutex<String>>,
}

pub struct SidecarStore(Mutex<Option<SidecarProcess>>);

impl Default for SidecarStore {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

fn app_root() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .ok()
}

fn dev_sidecar_entry() -> Option<(String, Vec<String>)> {
    let root = app_root()?;
    let entry = root.join("packages/desktop-api/src/bootstrap.ts");
    Some((
        "node".to_string(),
        vec![
            "--import".to_string(),
            "tsx".to_string(),
            entry.to_string_lossy().to_string(),
        ],
    ))
}

fn release_runtime_entry<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let runtime_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    let runtime = resource_dir.join("relaydesk-runtime").join(runtime_name);
    runtime.exists().then_some(runtime)
}

fn release_sidecar_entry<R: Runtime>(app: &AppHandle<R>) -> Option<(String, Vec<String>)> {
    let resource_dir = app.path().resource_dir().ok()?;
    let entry = resource_dir.join("desktop-api").join("desktop-api.mjs");
    if !entry.exists() {
        return None;
    }

    let runtime = release_runtime_entry(app)?;
    Some((
        runtime.to_string_lossy().to_string(),
        vec!["desktop-api/desktop-api.mjs".to_string()],
    ))
}

fn sidecar_command<R: Runtime>(app: &AppHandle<R>) -> Result<(String, Vec<String>), String> {
    if cfg!(debug_assertions) {
        return dev_sidecar_entry()
            .ok_or_else(|| "Unable to resolve the dev sidecar entry.".to_string());
    }

    release_sidecar_entry(app)
        .ok_or_else(|| "Unable to resolve the packaged sidecar entry.".to_string())
}

fn stopped_snapshot(lock: &mut Option<SidecarProcess>) -> SidecarSnapshot {
    *lock = None;
    SidecarSnapshot::stopped()
}

fn refresh_store(lock: &mut Option<SidecarProcess>) -> SidecarSnapshot {
    let Some(process) = lock.as_mut() else {
        return SidecarSnapshot::stopped();
    };

    match process.child.try_wait() {
        Ok(Some(_)) | Err(_) => stopped_snapshot(lock),
        Ok(None) => SidecarSnapshot::running(process.child.id()),
    }
}

fn stop_child(lock: &mut Option<SidecarProcess>) -> SidecarSnapshot {
    if let Some(process) = lock.as_mut() {
      let _ = process.child.kill();
      let _ = process.child.wait();
    }
    *lock = None;
    SidecarSnapshot::stopped()
}

fn with_store<T>(
    state: &SidecarStore,
    action: impl FnOnce(&mut Option<SidecarProcess>) -> Result<T, String>,
) -> Result<T, String> {
    let mut lock = state
        .0
        .lock()
        .map_err(|_| "Unable to lock sidecar state.".to_string())?;
    action(&mut lock)
}

fn spawn_stderr_collector(stderr: ChildStderr) -> Arc<Mutex<String>> {
    let tail = Arc::new(Mutex::new(String::new()));
    let sink = Arc::clone(&tail);

    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut chunk = [0_u8; 1024];

        loop {
            let bytes = match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(bytes) => bytes,
            };

            let text = String::from_utf8_lossy(&chunk[..bytes]);
            if let Ok(mut buffer) = sink.lock() {
                buffer.push_str(&text);
                if buffer.len() > MAX_STDERR_TAIL_BYTES {
                    let keep_from = buffer.len() - MAX_STDERR_TAIL_BYTES;
                    let trimmed = buffer[keep_from..].to_string();
                    *buffer = trimmed;
                }
            }
        }
    });

    tail
}

fn stderr_excerpt(stderr_tail: &Arc<Mutex<String>>) -> Option<String> {
    let text = stderr_tail.lock().ok()?.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(text)
}

fn spawn_sidecar<R: Runtime>(app: &AppHandle<R>) -> Result<SidecarProcess, String> {
    let (command, args) = sidecar_command(app)?;
    let mut command_builder = Command::new(command);
    command_builder
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("RELAYDESK_DESKTOP_API_TRANSPORT", "stdio");

    if !cfg!(debug_assertions) {
        if let Ok(resource_dir) = app.path().resource_dir() {
            command_builder.current_dir(resource_dir);
        }
    }

    #[cfg(target_os = "windows")]
    command_builder.creation_flags(CREATE_NO_WINDOW);

    let mut child = command_builder
        .spawn()
        .map_err(|error| format!("Unable to launch the local sidecar: {error}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Unable to capture sidecar stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to capture sidecar stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Unable to capture sidecar stderr.".to_string())?;
    let stderr_tail = spawn_stderr_collector(stderr);

    Ok(SidecarProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr_tail,
    })
}

pub fn launch_sidecar_internal<R: Runtime>(
    app: &AppHandle<R>,
    state: &SidecarStore,
) -> Result<SidecarSnapshot, String> {
    with_store(state, |lock| {
        let current = refresh_store(lock);
        if current.running {
            return Ok(current);
        }

        let process = spawn_sidecar(app)?;
        let pid = process.child.id();
        *lock = Some(process);
        Ok(SidecarSnapshot::running(pid))
    })
}

fn send_request(
    process: &mut SidecarProcess,
    request: &SidecarHttpRequest,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::to_string(request)
        .map_err(|error| format!("Unable to encode sidecar request: {error}"))?;
    process
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|error| format!("Unable to write sidecar request: {error}"))?;
    process
        .stdin
        .write_all(b"\n")
        .map_err(|error| format!("Unable to terminate sidecar request: {error}"))?;
    process
        .stdin
        .flush()
        .map_err(|error| format!("Unable to flush sidecar request: {error}"))?;

    let mut line = String::new();
    let bytes = process
        .stdout
        .read_line(&mut line)
        .map_err(|error| format!("Unable to read sidecar response: {error}"))?;
    if bytes == 0 {
        let detail = stderr_excerpt(&process.stderr_tail);
        return Err(match detail {
            Some(detail) => format!("Sidecar closed the RPC stream unexpectedly. {detail}"),
            None => "Sidecar closed the RPC stream unexpectedly.".to_string(),
        });
    }

    let response = serde_json::from_str::<SidecarRpcResponse>(line.trim())
        .map_err(|error| format!("Sidecar returned invalid RPC JSON: {error}"))?;

    if response.ok {
        return Ok(response.payload.unwrap_or(serde_json::Value::Null));
    }

    Err(response
        .error
        .unwrap_or_else(|| "Sidecar returned an unknown RPC error.".to_string()))
}

pub fn sidecar_request_internal<R: Runtime>(
    app: &AppHandle<R>,
    state: &SidecarStore,
    request: &SidecarHttpRequest,
) -> Result<serde_json::Value, String> {
    with_store(state, |lock| {
        let current = refresh_store(lock);
        if !current.running {
            *lock = Some(spawn_sidecar(app)?);
        }

        let process = lock
            .as_mut()
            .ok_or_else(|| "Sidecar process is unavailable.".to_string())?;
        send_request(process, request)
    })
}

pub fn shutdown_sidecar<R: Runtime>(app: &AppHandle<R>) {
    let state: State<'_, SidecarStore> = app.state();
    let _ = with_store(&state, |lock| Ok(stop_child(lock)));
}

#[tauri::command]
pub fn sidecar_status(state: State<'_, SidecarStore>) -> Result<SidecarSnapshot, String> {
    with_store(&state, |lock| Ok(refresh_store(lock)))
}

#[tauri::command]
pub fn sidecar_launch(
    app: tauri::AppHandle,
    state: State<'_, SidecarStore>,
) -> Result<SidecarSnapshot, String> {
    launch_sidecar_internal(&app, &state)
}

#[tauri::command]
pub fn sidecar_halt(state: State<'_, SidecarStore>) -> Result<SidecarSnapshot, String> {
    with_store(&state, |lock| Ok(stop_child(lock)))
}
