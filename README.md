#  Web Wallet
Nice and simple web wallet with robust [ApiServer](https://github.com/sugarchain-project/api-server) backend :3

Feel free to modify/use it in your projects :D

P.s. Working example [https://sugar.wtf/wallet/#/](https://github.com/sugarchain-project/api-server)  
P.s.s This wallet heavily based on OutCast3k [coinbin](http://github.com/OutCast3k/coinbin), check out his awesome github!

## AI Score Ledger

The wallet includes an AI Score Ledger tab for anchoring AI evaluation batches to Sugarchain. Full evaluation JSON is kept off-chain in browser storage, while the chain transaction contains only a compact 80-byte `SAI1` OP_RETURN proof payload.

The demo flow is:

1. Open a wallet.
2. Select **AI Score Ledger**.
3. Generate the `sugar-ai-test-001` batch.
4. Compute deterministic leaf hashes, Merkle root, manifest hash, and OP_RETURN payload.
5. Create and review a signed zero-value OP_RETURN transaction.
6. Broadcast only after explicit confirmation.
7. Verify by recomputing the local Merkle root and checking it against the OP_RETURN payload fetched from the wallet transaction API.

If the current Sugarchain API response does not expose raw transactions or output scripts, local Merkle verification still works, but on-chain OP_RETURN extraction will report the API limitation.
