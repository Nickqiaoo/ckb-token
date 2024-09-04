import fs from 'fs';
import path from 'path';
import { ccc } from '@ckb-ccc/core';

const PRIVATE_KEY = '0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6'

async function deploySudt() {
  const client = new ccc.ClientPublicTestnet("https://testnet.ckb.dev/", 60000);
  const signer = new ccc.SignerCkbPrivateKey(client, PRIVATE_KEY);


  // 读取 SUDT 二进制文件
  const sudtPath = path.resolve('../build/release/sudt');
  const sudtBinary = fs.readFileSync(sudtPath);
  const sudtSize = sudtBinary.length;
  const requiredCapacity = BigInt(sudtSize) + BigInt(61+65) ;
  try {
    // 构建交易
    const tx = ccc.Transaction.from({
      outputs: [
        {
          capacity: ccc.fixedPointFrom(requiredCapacity.toString()),
          lock: {
            codeHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
            hashType: 'type',
            args: '0x'
          },
        //   type:await ccc.Script.fromKnownScript(
        //     signer.client,
        //     ccc.KnownScript.TypeId,
        //     "00".repeat(32))
        }
      ],
      outputsData: [ccc.bytesFrom(sudtBinary)],
    });

    // 完成交易的输入和手续费
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);
    // if (tx.outputs[0].type) {
    //   tx.outputs[0].type.args = ccc.hashTypeId(
    //     tx.inputs[0],
    //     0
    //   );
    // }
    // 签名并发送交易
    const txHash = await signer.sendTransaction(tx);
    console.log('Contract deployed, tx hash:', txHash);

    // 等待交易确认
    const confirmTransaction = async () => {
      const tx = await client.getTransaction(txHash);
      const status = tx?.status;
      if (status === 'committed') {
        console.log('Contract deployment confirmed');
        const contractCodeHash = ccc.hashCkb(sudtBinary);

        const contractInfo = {
          codeHash: contractCodeHash,
          hashType: 'type',
          cellDeps: [{
            cellDep: {
              outPoint: {
                txHash: txHash,
                index: 0
              },
              depType: 'code'
            }
          }]
        };
        console.log('Contract info:', contractInfo);
      } else if (status === 'pending' || status === 'proposed') {
        console.log('Transaction still pending, waiting...');
        setTimeout(confirmTransaction, 5000); // 每5秒检查一次
      } else {
        console.error('Transaction failed or in unexpected status:', status);
      }
    };

    // 开始轮询确认交易
    await confirmTransaction();

  } catch (error) {
    console.error('Failed to deploy contract:', error);
  }
}

deploySudt().catch(console.error);