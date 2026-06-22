//! Platform abstraction facilities

#![allow(unused)]

pub(crate) mod unix;
pub(crate) use unix as platform;

pub(crate) mod hostname;
pub mod tokio_process;

pub mod fs;

pub use platform::{
	PlatformError, async_pipe, commands, fd, input, poll, process, resource, signal, terminal,
};
pub(crate) use platform::{env, network, users};
