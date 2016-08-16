# RightsContract Management System
The RightsContract Management System is a Dapp that allows users who, for example, collaborated in creating a piece of music, can decide on who deserves credit for their work, and allows them to vote amongst each other on a piece of metadata that best captures the reality of their work.

Users interact with the primary Ethereum smart contract, RightsContractFactory, to create new RightsContracts by name, and to get contract addresses by name. This is done through a Dapp deployed through truffle that can be accessed on a browser while running a geth node (and other eth wallets).

Once a user has selected a RightsContract, they can use the other functions to:

  * Receive total information about the current state of the contract

  * Add/remove contract participants

  * Vote/Make proposals for new metadata

  * Send payments to the contract

Among these functions, users within a contract can also claim it is invalid which acts as an emergency stop where no payments are taken.

## State Machine
Every RightsContract can be modeled with a simple state machine. Calling functions inside a contract can change the current stage of it. There are four main stages a contract can be in: `Drafted`, `Accepted`, `Published`, `Invalid.` Every contract starts off in the `Drafted` stage.

### Drafted
In this initial stage, the person who first created the contract has permission to add/remove parties. It's important to recognize that the creator is **not** automatically added as participant of the contract, but should add themselves to the contract first. As is, this means the person creating the contract should be an active participant.

TODO: Address how this might affect voting dynamics for moving to the `Accepted` stage. That initial creator will have permission to add/remove parties and also to invalidate the contract!

### Accepted
TODO: Explain this stage.

### Published
TODO: Explain this stage.

### Invalid
TODO: Explain this stage.

### Note on Intermediary Voting Stages
TODO: Explain this stage.

## Diagram
TODO: Add image

## Example Use case
TODO: Add example in music rights. Put project into one folder, add example folder with IPFS hash pointing to small file-system:
        * metadata.json
        * song.mp3 (or encrypted song)
        * contract.pdf
        * contract.md

TODO: Add screenshots

## TODO:

Possibly rethink voting mechanism. Generalize it so that advancement of the state machine uses the same majority check for votes.
