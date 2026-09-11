//! Error type shared by every Tauri command.
//!
//! Serializes to `{ kind, message }` so the frontend can branch on `kind`
//! (e.g. show a conflict dialog) without string-matching the message.

use serde::ser::SerializeStruct;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// User input failed a validation rule.
    #[error("{0}")]
    Validation(String),

    /// Referenced profile / file does not exist.
    #[error("{0}")]
    NotFound(String),

    /// Operation would clobber something the user has not agreed to clobber.
    #[error("{0}")]
    Conflict(String),

    /// Filesystem failure, annotated with what we were doing.
    #[error("{context}: {source}")]
    Io {
        context: String,
        #[source]
        source: std::io::Error,
    },

    /// A whitelisted external command (git / ssh-keygen / ssh) failed.
    #[error("{0}")]
    Command(String),

    /// A JSON file on disk was not readable as the shape we expect.
    #[error("{context}: {source}")]
    Json {
        context: String,
        #[source]
        source: serde_json::Error,
    },
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Validation(_) => "validation",
            AppError::NotFound(_) => "not_found",
            AppError::Conflict(_) => "conflict",
            AppError::Io { .. } => "io",
            AppError::Command(_) => "command",
            AppError::Json { .. } => "json",
        }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        AppError::Validation(msg.into())
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        AppError::NotFound(msg.into())
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        AppError::Conflict(msg.into())
    }

    pub fn command(msg: impl Into<String>) -> Self {
        AppError::Command(msg.into())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

/// Attach a human description to an io error without a `map_err` closure everywhere.
pub trait IoCtx<T> {
    fn ctx(self, context: impl Into<String>) -> Result<T>;
}

impl<T> IoCtx<T> for std::result::Result<T, std::io::Error> {
    fn ctx(self, context: impl Into<String>) -> Result<T> {
        self.map_err(|source| AppError::Io {
            context: context.into(),
            source,
        })
    }
}

pub trait JsonCtx<T> {
    fn ctx(self, context: impl Into<String>) -> Result<T>;
}

impl<T> JsonCtx<T> for std::result::Result<T, serde_json::Error> {
    fn ctx(self, context: impl Into<String>) -> Result<T> {
        self.map_err(|source| AppError::Json {
            context: context.into(),
            source,
        })
    }
}
