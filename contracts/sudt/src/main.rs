#![no_std]
#![cfg_attr(not(test), no_main)]

#[cfg(test)]
extern crate alloc;

#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!(32 * 1024, 4096 * 4096, 64);

use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::Unpack},
    error::SysError,
    high_level::{load_cell_data, load_cell_lock_hash, load_script},
};
use core::result::Result;

const BLAKE2B_BLOCK_SIZE: usize = 32;

#[derive(Debug)]
pub enum Error {
    Syscall(SysError),
    Encoding,
    ArgumentsLen,
    ScriptTooLong,
    Overflowing,
    Amount,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        Error::Syscall(err)
    }
}

pub fn program_entry() -> i8 {
    match main() {
        Ok(_) => 0,
        Err(err) => {
            ckb_std::debug!("Error: {:?}", err);
            -1
        }
    }
}

fn main() -> Result<(), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();

    if args.len() != BLAKE2B_BLOCK_SIZE {
        return Err(Error::ArgumentsLen);
    }

    let mut owner_mode = false;
    let mut i = 0;
    while let Ok(lock_hash) = load_cell_lock_hash(i, Source::Input) {
        if lock_hash.as_slice() == args.as_ref() {
            owner_mode = true;
            break;
        }
        i += 1;
    }

    if owner_mode {
        return Ok(());
    }

    let input_amount = gather_amount(Source::GroupInput)?;
    let output_amount = gather_amount(Source::GroupOutput)?;

    if input_amount < output_amount {
        return Err(Error::Amount);
    }

    Ok(())
}

fn gather_amount(source: Source) -> Result<u128, Error> {
    let mut amount: u128 = 0;
    let mut i = 0;
    while let Ok(data) = load_cell_data(i, source) {
        if data.len() < 16 {
            return Err(Error::Encoding);
        }
        let current_amount = u128::from_le_bytes(data[..16].try_into().unwrap());
        amount = amount
            .checked_add(current_amount)
            .ok_or(Error::Overflowing)?;
        i += 1;
    }
    Ok(amount)
}
