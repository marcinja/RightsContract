import "./RightsContract.sol";

contract RightsContractFactory {
    address public creator;

    mapping (bytes32 => address) public contracts;


    function RightsContractFactory() {
        creator = msg.sender;
    }

    event RightsContractCreated(bytes32 indexed _name, address indexed _addr);

    function initiateContract(bytes32 name) {
        //Names cannot be overwritten. Instead, they must be deleted first.
        if (contracts[name] != 0x0){
            throw;
        }
        address c = new RightsContract();
        contracts[name] = c;
        RightsContractCreated(name, c);
    }
    
    function getContractAddr(bytes32 _name) public constant returns(address retVal){
        return contracts[_name];
    }

    function removeContract(bytes32 name){
        address cAddr = contracts[name];
        if (cAddr == 0x0){
            throw;
        }
        RightsContract c = RightsContract(cAddr);
        //Check if c is disputed
        if (c.getStage() == 3){
            if (c.getPermission(msg.sender) || (msg.sender == creator)) {
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
