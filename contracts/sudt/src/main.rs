#![no_std]
#![cfg_attr(not(test), no_main)]

#[cfg(test)]
extern crate alloc;

#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

// Import heap related library from `alloc`
// https://doc.rust-lang.org/alloc/index.html
use alloc::vec::Vec;

// Import CKB syscalls and structures
// https://docs.rs/ckb-std/
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::*},
    debug,
    high_level::{load_cell_data, load_cell_lock_hash, load_script, QueryIter},
};


const UDT_LEN: usize = 16;

use ckb_std::error::SysError;

/// Error
#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    Amount,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        use SysError::*;
        match err {
            IndexOutOfBound => Self::IndexOutOfBound,
            ItemMissing => Self::ItemMissing,
            LengthNotEnough(_) => Self::LengthNotEnough,
            Encoding => Self::Encoding,
            Unknown(err_code) => panic!("unexpected sys error {}", err_code),
        }
    }
}


/// program entry
pub fn program_entry() -> i8 {
    // Call main function and return error code
    match main() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}

pub fn main() -> Result<(), Error> {
    let script = load_script()?;

    let args: Bytes = script.args().unpack();
    debug!("script args is {:?}", args);

    // return success if owner mode is true
    if check_owner_mode(&args)? {
        return Ok(());
    }

    let inputs_amount = gather_amount(Source::GroupInput)?;
    let outputs_amount = gather_amount(Source::GroupOutput)?;

    if inputs_amount < outputs_amount {
        return Err(Error::Amount);
    }

    Ok(())
}

fn check_owner_mode(args: &Bytes) -> Result<bool, Error> {
    // With owner lock script extracted, we will look through each input in the
    // current transaction to see if any unlocked cell uses owner lock.
    let is_owner_mode = QueryIter::new(load_cell_lock_hash, Source::Input)
        .find(|lock_hash| args[..] == lock_hash[..])
        .is_some();
    Ok(is_owner_mode)
}

fn gather_amount(source: Source) -> Result<u128, Error> {
    // With the sum of all input UDT tokens gathered, let's now iterate through
    // output cells to grab the sum of all output UDT tokens.
    let mut buf = [0u8; UDT_LEN];

    let udt_list = QueryIter::new(load_cell_data, source)
        .map(|data| {
            if data.len() == UDT_LEN {
                buf.copy_from_slice(&data);
                // u128 is 16 bytes
                Ok(u128::from_le_bytes(buf))
            } else {
                Err(Error::Encoding)
            }
        })
        .collect::<Result<Vec<_>, Error>>()?;
    Ok(udt_list.into_iter().sum::<u128>())
}