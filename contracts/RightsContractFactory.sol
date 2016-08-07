import "./RightsContract.sol";

contract RightsContractFactory { //needs better name (?)
    address public creator;

    //Still considering different options for naming contracts.
    //OR JUST USE CONTRACT ADDRESS
    mapping (bytes32 => address) public contracts;


    function RightsContractFactory() {
        creator = msg.sender;
    }

    event RightsContractCreated(bytes32 indexed _name, address indexed _addr);

    function initiateContract(bytes32 name) {
        //Names cannot be overwritten. Instead, they must be deleted first.

        //TODO: test this if-statement
        if (contracts[name] != 0x0){
            throw;
        }
        address c = new RightsContract();
        contracts[name] = c;
        RightsContractCreated(name, c);
    }

    function showContractAddr(bytes32 _name) public constant returns(address retVal){
        return contracts[_name];
    }

    function removeContract(bytes32 name){
        address cAddr = contracts[name];
        if (cAddr == 0x0){
            throw;
        }
        RightsContract c = RightsContract(cAddr);
        //Check if c is invalid
        if (c.checkStage() == 3){
            if (c.checkPermission(msg.sender) || (msg.sender == creator)) {
                //Delete contract data inside?
                //c.delete()

                //not sure how this behaves exactly
                //contracts[name] = "" 0x0 0 might be better
                delete contracts[name];
            }
        }
    }

    function remove() {
        if (msg.sender == creator) {
            suicide(creator);
        }
    }
}
