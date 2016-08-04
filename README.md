# RightsContract Management System
The RightsConract Management System is a Dapp that allows users who, for example, collaborated in creating a piece of music, can decide on who deserves credit for their work, and allows them to vote amongst each other on a piece of metadata that best captures the reality of their work.

Users interact with the primary Ethereum smart contract, MakeContract, to create new RightsContracts by name, and to get contract addresses by name. This is done through a Dapp deployed through truffle that can be accessed on a browser while running a geth node (and other eth wallets).

Once a user has selected a RightsContract, they can use the other functions to:

   -Recieve total information about the current state of the contract
  
  -Add/remove contract participants
  
  -Vote/Make proposals for new metadata
  
  -Send payments to the contract
  
Among these functions, users within a contract can also claim it is invalid which acts as an emergency stop where no payments are taken.
