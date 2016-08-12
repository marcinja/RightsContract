
contract RightsContract {

    enum Stages {
        Drafted,
        Accepted,
        Published,
        Invalid
    }
    Stages public stage;

    function RightsContract() {
        stage = Stages.Drafted;
        numberPartyAddresses = 0;
        splitTotal = 0;
    }

    //Modifiers to ensure contract changes can be locked in
    modifier atDrafted {
        if (stage == Stages.Drafted){
            _
        }
    }

    modifier isValid {
        if (stage != Stages.Invalid){
            _
        }
    }

    modifier atAccepted {
        if (stage == Stages.Accepted){
            _
        }
    }

    modifier atInvalid{
        if (stage == Stages.Invalid){
            _
        }
    }

    //People who are allowed to make changes to this contract
    mapping (address => bool) public Permission;

    //Iterating through this allows us to check splitTotal
    address[] partyAddresses;

    //Once all partyAddresses accept, move in to Accepted stage
    uint numberPartyAddresses;
    uint numberAccepted;

    //total must be <= 100 in Drafted stage, and exactly 100 to move forward
    uint splitTotal;

    //The meta data;
    string ipfsHash;

    //Structure for person involved in contract
    struct Party {
        string name;
        string role;
        uint rightsSplit; //splits should be moved into payment contract!
        bool accepts;
    }

    //every address in partAddresses maps to a Party
    mapping (address => Party) Participants;

    //amount owed to each individual party
    mapping (address => uint) balance;

    //For metadata:
    mapping (address => string) public proposals;

    mapping (address => address) public votes;


    modifier hasPermission {
        if (Permission[msg.sender]){
            _
        }
    }

    function checkPermission(address addr) public constant returns(bool retVal){
        return Permission[addr];
    }

    function setPermission(address addr){
        if (numberPartyAddresses != 0){
            throw;
        }
        Permission[addr] = true;
    }


    function checkStage() public constant returns (uint retVal){
        return uint(stage);
    }

    //Fails if splitTotal goes over 100
    function makeParty(address _addr, string _name, string _role, uint _rightsSplit) hasPermission atDrafted {
        if (!(splitTotal + _rightsSplit <= 100)) {
            throw;
        }
        Party memory p = Party(
            _name,
            _role,
            _rightsSplit,
            false
            );
        Participants[_addr] = p;
        Permission[_addr] = true;
        partyAddresses.push(_addr);
        splitTotal += _rightsSplit;
        numberPartyAddresses += 1;
    }

    function removeParty(address _addr) hasPermission atDrafted{
        //Not the most efficient method, will rethink later
        if (!Permission[_addr] || numberPartyAddresses == 0){
            throw; //party already deleted
        }
        uint arrLength = numberPartyAddresses -1;
        delete Permission[_addr];
        delete Participants [_addr];

        //causes cap of 100 for participants which shouldn't matter, but is stupid design. 'integer literal is needed for array length'
        address[100] memory temp;
        uint addrIndex;

        for (uint i = 0; i < numberPartyAddresses; i++){
            if (partyAddresses[i] != _addr){
                temp[i] = partyAddresses[i];
            } else {
                addrIndex = i;
                break;
            }
        }

        for (uint j = addrIndex; j < arrLength; j++){
            temp[j] = partyAddresses[j+1];
        }

        delete partyAddresses;

        for (uint k = 0; k < arrLength; k++){
            partyAddresses.push(temp[k]);
        }

        numberPartyAddresses -= 1;
    }

    function checkSplit() public constant returns (bool retVal){
        uint sum;
        for (uint i = 0; i < numberPartyAddresses; i++){
            sum += Participants[partyAddresses[i]].rightsSplit;
        }
        if (sum == 100){
            return true;
        } else {
            return false;
        }
    }

    //If all partyAddresses have accepted, move to Accepted, and allow for PaymentContract creation
    function acceptTerms() hasPermission atDrafted {
        if (!checkSplit()){
            throw;
        }
        numberAccepted++;
        uint s = numberPartyAddresses - numberAccepted;
        if (s == 0) {
            stage = Stages.Accepted;
        }
    }

    function createProposal(string _proposal) hasPermission {
        //If anyone has voted for your proposal(other than yourself), throw.
        for (uint i = 0; i < numberPartyAddresses; i++){
            if (votes[partyAddresses[i]] == msg.sender && partyAddresses[i] != msg.sender){
                throw;
                }
            }
        proposals[msg.sender] = _proposal;
    }

    function getProposal(address addr) constant returns (string _proposal){
        return proposals[addr];
    }

    function vote(address addr) hasPermission {
        votes[msg.sender] = addr;
    }

    //Can be done at Accepted or Published
    function setMetaHash() hasPermission {
        if (stage != Stages.Published && stage != Stages.Accepted){
            throw;
        }

        uint majorityProposalIndex = checkVotes();
        if (majorityProposalIndex == 101){
            throw;
        }

        ipfsHash = proposals[partyAddresses[majorityProposalIndex]];
        stage = Stages.Published;

        //After metadata is set, votes are cleared (but proposals stay)
        for (uint i = 0; i < numberPartyAddresses; i++){
            delete votes[partyAddresses[i]];
        }
    }

    function checkVotes() public constant returns(uint retVal){
        mapping(address => uint) count;
        uint majorityProposal;
        uint maxVote = 0;

        for (uint i = 0; i < numberPartyAddresses; i++){
            address ithVote = votes[partyAddresses[i]];
            count[ithVote] += 1;
        }

        for (uint j = 0; j < numberPartyAddresses; j++){
           if (count[partyAddresses[j]] > maxVote){
                maxVote = count[partyAddresses[j]];
                majorityProposal = j;
            }
        }

        if (maxVote > (numberPartyAddresses / 2)){
            return majorityProposal;
        } else {
            //Since 100 is the max number of parties allowed
           return 101;
       }
    }

    //Payments:
    bool paymentsUnlocked;

    //Should be available atPublished(?) only
    function unlockPayments() hasPermission atAccepted isValid{
        paymentsUnlocked = true;
    }

    function showPaymentsUnlocked() public constant returns(bool retVal){
        return paymentsUnlocked;
    }

    event Payment (address indexed sender, string indexed from, string indexed  purpose);

    function sendPayment(string _from, string _purpose) {
        uint total = msg.value;
        for (uint i = 0; i < numberPartyAddresses; i++){
            address p = partyAddresses[i];
            uint owed = total / Participants[p].rightsSplit;
            balance[p] += owed;
            total += owed;
        }
        Payment(msg.sender, _from, _purpose);
    }

    function checkBalance() constant returns (uint retVal) {
        return balance[msg.sender];
    }

    function withdrawBalance() hasPermission {
        uint currentBalance = balance[msg.sender];
        balance[msg.sender] = 0;
        if (!msg.sender.send(currentBalance)) {
            throw;
        }
    }

    //Stops advancement of contract. Indicates some real world communication will be needed.
    function claimInvalid() hasPermission{
        stage = Stages.Invalid;
        paymentsUnlocked = false;
        numberAccepted = 0;
    }

    //If everyone "accepts" contract again, contract moves to drafted state again.
    function reinstateContract() hasPermission atInvalid {
        if (!checkSplit()){
            throw;
        }
        numberAccepted++;
        uint s = numberPartyAddresses - numberAccepted;
        if (s == 0) {
            stage = Stages.Drafted;
            numberAccepted = 0;
        }
    }

    //Below are contant functions for displaying contract info:
    function showMetaHash() public constant returns(string retVal) {
        return ipfsHash;
    }

    function showNumberPartyAddresses() public constant returns(uint retVal) {
        return numberPartyAddresses;
    }

    function showAddrs(uint i) public constant returns(address retVal) {
        return partyAddresses[i];
    }

    function showPartyName(uint i) public constant returns(string _name){
        return Participants[partyAddresses[i]].name;
    }

    function showPartyRole(uint i) public constant returns(string _role){
        return Participants[partyAddresses[i]].role;
    }

    function showPartySplit(uint i) public constant returns(uint _split){
        return Participants[partyAddresses[i]].rightsSplit;
    }

    function showPartyAccept(uint i) public constant returns(bool _accepts){
        return Participants[partyAddresses[i]].accepts;
    }

    function showPartyVote(uint i) public constant returns(address _vote){
        return votes[partyAddresses[i]];
    }
}
