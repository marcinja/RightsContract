# RightsContract Management System
The RightsContract Management System is a Dapp that allows users who, for example, collaborated in creating a piece of music, can decide on who deserves credit for their work, and allows them to vote amongst each other on a piece of metadata that best captures the reality of their work.

Users interact with the primary Ethereum smart contract, RightsContractFactory, to create new RightsContracts by name, and to get contract addresses by name. This is done through a Dapp deployed through truffle that can be accessed on a browser while running a geth node (and possibly other eth wallets).

Once a user has selected a RightsContract, they can use the other functions to:

  * Receive total information about the current state of the contract

  * Add/remove contract participants

  * Vote for/Make new proposals for metadata (in form of a hash)

  * Send payments to the contract

Among these functions, users within a contract can also claim it is invalid which acts as an emergency stop where no changes can be made in the contract, and no payments can be sent to the contract. A contract can come back from the `Invalid` stage if all participants agree to try again. At that point the contract returns to the `Drafted` Stage.

## Overview of the State Machine
Every RightsContract can be modeled with a finite state machine. Calling functions inside a contract can change the current stage of it. There are four main stages a contract can be in: `Drafted`, `Accepted`, `Published`, `Invalid.`
E
very contract starts off in the `Drafted` stage. Once all participants have agreed on the set of participants involved, the contract moves to the `Accepted` stage. Then, if the payment split is nonzero the contract will allow for anyone to send payments to the contract. Those payments will be split as determined by the participants.

In the `Drafted` and `Accepted` stages (and also the `Published` stage later) participants

### Drafted
In this initial stage, the person who first created the contract has permission to add/remove parties. It's important to recognize that the creator is **not** automatically added as participant of the contract, but should add themselves to the contract first. As is, this means the person creating the contract should be an active participant.

TODO: Address how this might affect voting dynamics for moving to the `Accepted` stage. That initial creator will have permission to add/remove parties and also to invalidate the contract!

### Accepted
TODO: Explain this stage.

### Published
TODO: Explain this stage.

### Invalid
TODO: Explain this stage.

### Note on Intermediary Stages
TODO: Explain this stage.

### Note on Contract Permissions
TODO: Explain who can interact with the contract, and in what way.

## Diagram
![State Machine Diagram](/statemachinediagram.jpg)



## Example Use case
TODO: Add example in music rights. Put project into one folder, add example folder with IPFS hash pointing to small file-system:

    * metadata.json
    * song.mp3 (or hash of song)
    * contract.pdf
    * contract.md

TODO: Add screenshots
