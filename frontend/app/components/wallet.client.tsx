import { ccc, numFrom, udtBalanceFrom } from '@ckb-ccc/connector-react';
import React, { useEffect, useState, useCallback } from 'react';
import offckb, { readEnvNetwork } from 'offckb.config';
import { buildCccClient } from './wallet-client.client';

// Add this new component for the loading spinner
function LoadingSpinner() {
  return (
    <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
  );
}

function WalletIcon({ wallet, className }: { wallet: ccc.Wallet; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={wallet.icon} alt={wallet.name} className={`h-8 w-8 rounded-full ${className}`} />
  );
}

// 修改 Button 组件以支持 disabled 属性
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex items-center rounded-full bg-orange-600 px-5 py-3 text-white ${props.className} ${
        props.disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    />
  );
}

// Add this custom hook at the top of the file
function useConfirmTransaction(client: ccc.Client) {
  return useCallback(async (txHash: string, onSuccess: (hash: string) => void, onFailure: (hash: string) => void) => {
    const confirmTransaction = async () => {
      const tx = await client.getTransaction(txHash);
      const status = tx?.status;
      if (status === 'committed') {
        onSuccess(txHash);
        console.log('Transaction confirmed');
      } else if (status === 'pending' || status === 'proposed') {
        console.log('Transaction still pending, waiting...');
        setTimeout(confirmTransaction, 5000); // Check every 5 seconds
      } else {
        onFailure(txHash);
        console.error('Transaction failed or in unexpected status:', status);
      }
    };

    await confirmTransaction();
  }, [client]);
}

function Issue({ setIssueArgs }: { setIssueArgs: (args: string) => void }) {
  const signer = ccc.useSigner();
  const network = readEnvNetwork();
  const client = buildCccClient(network);
  const [issueRes, setIssueRes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [amount, setAmount] = useState<string>(''); // New state for amount
  const confirmTransaction = useConfirmTransaction(client);

  return (
    <div className="my-6 mx-2">
      {issueRes !== '' && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-2">Issue Result</h3>
          <p className="text-green-700 break-all">{issueRes}</p>
        </div>
      )}
      {isProcessing && (
        <div className="mb-4 p-4 bg-blue-100 border border-blue-400 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-800 mb-2 flex items-center">
            <LoadingSpinner />
            Processing
          </h3>
          <p className="text-blue-700">Transaction is being processed. Please wait...</p>
          {txHash && <p className="text-blue-700 break-all mt-2">Transaction Hash: {txHash}</p>}
        </div>
      )}
      <div className="mb-1 flex items-center">
        <input
          className="rounded-full border border-black px-4 py-2 mr-2"
          type="text"
          value={amount}
          onInput={(e) => setAmount(e.currentTarget.value)}
          placeholder="Enter amount to issue"
        />
        <Button
          className="ml-2"
          onClick={async () => {
            if (!signer) {
              return;
            }
            setIsProcessing(true);
            const address = await ccc.Address.fromString(await signer.getRecommendedAddress(), signer.client);
            const args = address.script.hash();
            setIssueArgs(args);
            const tx = ccc.Transaction.from({
              outputs: [{
                lock: address.script,
                capacity: ccc.fixedPointFrom(200),
                type: {
                  codeHash: offckb.myScripts['sudt']?.codeHash ?? '0x00',
                  hashType: offckb.myScripts['sudt']?.hashType ?? 'type',
                  args: args
                },
              }],
              cellDeps: [
                {
                  outPoint: {
                    txHash: offckb.myScripts['sudt']?.cellDeps[0].cellDep.outPoint.txHash ?? '0x0',
                    index: offckb.myScripts['sudt']?.cellDeps[0].cellDep.outPoint.index ?? 0,
                  },
                  depType: offckb.myScripts['sudt']?.cellDeps[0].cellDep.depType ?? 'code'
                }
              ],
              outputsData: [ccc.bytesFrom(ccc.numLeToBytes(amount, 16), "hex")], // Use the amount input
            });

            // Complete missing parts for transaction
            await tx.completeInputsByCapacity(signer);
            await tx.completeFeeBy(signer, 1000);
            // 签名并发送交易
            console.log('Transaction details:', tx);

            const txHash = await signer.sendTransaction(tx);
            setTxHash(txHash);
            console.log('Contract deployed, tx hash:', txHash);

            await confirmTransaction(
              txHash,
              (hash) => {
                setIssueRes(`Success. Transaction Hash: ${hash}`);
                setIsProcessing(false);
              },
              (hash) => {
                setIssueRes(`Failed. Transaction Hash: ${hash}`);
                setIsProcessing(false);
              }
            );
          }}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <LoadingSpinner />
              Processing...
            </>
          ) : (
            'Issue'
          )}
        </Button>
      </div>
    </div>
  );
}

function Transfer({ issueArgs }: { issueArgs: string }) {
  const signer = ccc.useSigner();
  const [transferTo, setTransferTo] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [hash, setHash] = useState<string>('');
  const [data, setData] = useState<string>('');
  const network = readEnvNetwork();
  const client = buildCccClient(network);
  const confirmTransaction = useConfirmTransaction(client);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  return (
    <div className="my-6 mx-2">
      {hash !== '' ? <p className="mb-1 w-full whitespace-normal text-balance break-all text-center">{hash}</p> : <></>}
      <div className="mb-1 flex items-center">
        <div className="flex flex-col">
          <input
            className="rounded-full border border-black px-4 py-2"
            type="text"
            value={transferTo}
            onInput={(e) => setTransferTo(e.currentTarget.value)}
            placeholder="Enter address to transfer to"
          />
          <input
            className="mt-1 rounded-full border border-black px-4 py-2"
            type="text"
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
            placeholder="Enter amount to transfer"
          />
          <textarea
            className="mt-1 rounded-3xl border border-black px-4 py-2"
            value={data}
            onInput={(e) => setData(e.currentTarget.value)}
            placeholder="Enter data in the cell. Hex string will be parsed."
          />
        </div>
        <Button
          className="ml-2"
          onClick={async () => {
            if (!signer) {
              return;
            }
            const address = await ccc.Address.fromString(await signer.getRecommendedAddress(), signer.client);

            // Verify address
            const toAddress = await ccc.Address.fromString(transferTo, signer.client);
            const sUdtType = ccc.Script.from({
              codeHash: offckb.myScripts['sudt']?.codeHash ?? '0x00',
              hashType: offckb.myScripts['sudt']?.hashType ?? 'type',
              args: issueArgs
            });
            // === Composing transaction with ccc ===
            const tx = ccc.Transaction.from({
              outputs: [{ lock: toAddress.script, type: sUdtType }],
              outputsData: [ccc.numLeToBytes(amount, 16),],
            });

            await tx.completeInputsByUdt(signer, sUdtType);
            const balanceDiff =
              (await tx.getInputsUdtBalance(signer.client, sUdtType)) -
              tx.getOutputsUdtBalance(sUdtType);
            if (balanceDiff > ccc.Zero) {
              tx.addOutput(
                {
                  lock: address.script,
                  type: sUdtType,
                },
                ccc.numLeToBytes(balanceDiff, 16),
              );
            }
            tx.addCellDeps(
              [
                {
                  outPoint: {
                    txHash: offckb.myScripts['sudt']?.cellDeps[0].cellDep.outPoint.txHash ?? '0x0',
                    index: offckb.myScripts['sudt']?.cellDeps[0].cellDep.outPoint.index ?? 0,
                  },
                  depType: offckb.myScripts['sudt']?.cellDeps[0].cellDep.depType ?? 'code'
                }
              ]
            );
            await tx.completeInputsByCapacity(signer);
            await tx.completeFeeBy(signer, 1000);

            console.log('Transaction details:', tx);

            setIsProcessing(true);
            const txHash = await signer.sendTransaction(tx);
            setHash(txHash);

            await confirmTransaction(
              txHash,
              (hash) => {
                setHash(`Success. Transaction Hash: ${hash}`);
                setIsProcessing(false);
              },
              (hash) => {
                setHash(`Failed. Transaction Hash: ${hash}`);
                setIsProcessing(false);
              }
            );
          }}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <LoadingSpinner />
              Processing...
            </>
          ) : (
            'Transfer'
          )}
        </Button>
      </div>
    </div>
  );
}

function Balance({ issueArgs }: { issueArgs: string }) {
  const [address, setAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const network = readEnvNetwork();
  const client = buildCccClient(network);

  const fetchBalance = async () => {
    setIsLoading(true);
    try {
      const addr = await ccc.Address.fromString(address, client);
      const sUdtType = ccc.Script.from({
        codeHash: offckb.myScripts['sudt']?.codeHash ?? '0x00',
        hashType: offckb.myScripts['sudt']?.hashType ?? 'type',
        args: issueArgs
      });

      let totalBalance = BigInt(0);

      for await (const cell of client.findCellsByCollectableSearchKey({
        script: addr.script,
        scriptType: "lock",
        filter: {
          script: sUdtType,
          outputDataLenRange: [16, numFrom("0xffffffff")],
        },
        scriptSearchMode: "exact",
        withData: true,
      })) {
        totalBalance += udtBalanceFrom(cell.outputData);
      }

      setBalance(totalBalance.toString());
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance('Error fetching balance');
    }
    setIsLoading(false);
  };

  return (
    <div className="my-6 mx-2">
      <div className="mb-1 flex items-center">
        <input
          className="rounded-full border border-black px-4 py-2 mr-2"
          type="text"
          value={address}
          onInput={(e) => setAddress(e.currentTarget.value)}
          placeholder="Enter address to check balance"
        />
        <Button
          className="ml-2"
          onClick={fetchBalance}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <LoadingSpinner />
              Loading...
            </>
          ) : (
            'Check Balance'
          )}
        </Button>
      </div>
      {balance && (
        <div className="mt-2 p-2 bg-gray-100 rounded">
          <p>Balance: {balance}</p>
        </div>
      )}
    </div>
  );
}

export function Wallet() {
  const { wallet, open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();

  const [internalAddress, setInternalAddress] = useState('');
  const [address, setAddress] = useState('');
  const [issueArgs, setIssueArgs] = useState<string>('');

  useEffect(() => {
    if (!signer) {
      setInternalAddress('');
      setAddress('');
      return;
    }

    (async () => {
      setInternalAddress(await signer.getInternalAddress());
      setAddress(await signer.getRecommendedAddress());
    })();
  }, [signer]);

  useEffect(() => {
    const network = readEnvNetwork();
    setClient(buildCccClient(network));
  }, [offckb.currentNetwork, setClient]);

  return (
    <div>
      {wallet ? (
        <>
          <div className="my-6 mx-2">
            <WalletIcon wallet={wallet} className="mb-1" />
            <p className="mb-1">Connected to {wallet.name}</p>
            <p className="mb-1">{internalAddress}</p>
            <p className="mb-1 text-balance">{address}</p>
          </div>
          <Issue setIssueArgs={setIssueArgs} />
          <hr />
          <Transfer issueArgs={issueArgs} />
          <hr />
          <Balance issueArgs={issueArgs} />
          <hr />
          <Button className="mt-4" onClick={disconnect}>
            Disconnect
          </Button>
        </>
      ) : (
        <Button onClick={open}>Connect Wallet</Button>
      )}
    </div>
  );
}
