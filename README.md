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
Every RightsContract can be modeled with a finite state machine. Calling functions inside a contract can change the current stage of it. There are four main stages a contract can be in: `Drafted`, `Accepted`, `Published`, `Disputed.`
E
very contract starts off in the `Drafted` stage. Once all participants have agreed on the set of participants involved, the contract moves to the `Accepted` stage. Then, if the payment split is nonzero the contract will allow for anyone to send payments to the contract. Those payments will be split as determined by the participants.

In the `Drafted` and `Accepted` stages (and also the `Published` stage later) participants can make proposals for the hash that will be stored in the contract, and also vote for them. Once the contract is in the `Accepted` stage, if a majority of participants have voted for someone's proposal, that proposal will be published to the contract as the official hash.

After exiting the `Drafted` stage, participants can dispute the contract and put it into the `Disputed` stage. At that point, a new hash cannot be set and payments can no longer be received. At that point, if all participants agree to reinstate the contract they reenter the `Accepted` stage. This does not allow participants to change who is allowed to participate in the contract. It does however pause payments until the contract exits the `Disputed` stage.

### Drafted
In this initial stage, the person who first created the contract has permission to add/remove parties. It's important to recognize that the creator is **not** automatically added as participant of the contract, but should add themselves to the contract first. As is, this means the person creating the contract should be an active participant.

Once all desired participants have been added to the contract, they must all accept the contract for it to move forward. In this stage the only meaningful actions are: adding participants, removing them, and accepting the contract.

Note that the splits of the participants must either sum to 100 or to 0. In the former case, they represent percentage of ownership, and the percentage received from each payment. The latter makes the contract function in the same way, except the contract will not accept payments.

### Accepted
Once all participants have accepted the contract's first stage, they move forward to the `Accepted` stage. If the splits of the parties involved adds up to 100, then payments can then be unlocked by any party. Splits act as percentages; if a participant has a split 20, he gets 20% of every payments.

### Published
At any point in the `Drafted` and `Published` stages, participants can submit proposals for a hash. They can also vote on each other's proposals. Once the contract is past the `Drafted` stage, votes can actually be counted. If a user attempts to set the hash, and a majority of contract participants have voted on the same proposal, that proposal becomes the hash associated with the contract. Then votes are reset, and users can vote again if they wish to change the hash.

### Disputed
In the `Accepted` and `Published` stages, a participant can dispute it. This acts as a signal to other participants (and outside parties) that something is not working out, and extra communication between participants is needed to continue.

No payments are accepted in this stage. Nobody can set a new hash in this stage.

Once some kind of communication has been resolved, the contract can move from `Disputed` to `Accepted` if all participants agree to reinstate the contract. This allows the set of participants in the contract to be edited.

### Note on Intermediary Stages
The contract moves between stages by means of voting. This means that the true state machine that represents the contract has intermediary stages where only a subset of participants have accepted the contract (between `Drafted` and `Accepted`), and when no proposal has a majority of votes (between `Accepted` and `Published`).

## Diagram
![State Machine Diagram](/statemachinediagram.jpg)

## Example Use case
Check the `example` folder for what kind of information participants might want to put in the contract. The IPFS hash for that folder is: `QmVF7k7ts8sKp1caMmZ92S2CQ9UcjZ6Zm6hAggvSG9crg8`. This hash is the only information that is stored in the Ethereum contract and acts as a pointer to the folder.

Users are free include whatever they'd like. This means they share the actual files for their songs, along with sheet music, and fully disclose their contract. Alternatively, they could share encrypted versions of those files, or just cryptographic hashes of them to use the RightsContract as a proof of ownership in some way.
