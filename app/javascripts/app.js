var accounts;
var account;
var balance;

var currentRCaddr;
var currentMVaddr;
var currentPCaddr;

var currentRC;
var currentMV;
var curenntPC;
/*geth --datadir ~/Repos/MusicContract/local_eth --rpc --rpcport "8545" --rpccorsdomain "*" --nodiscover --networkid 12459 console */

var make = MakeContract.deployed()

function initRightsContract() {
	var name = document.getElementById("newRightsContract").value;
    var addr;
	make.initiateContract(name, {from: account}).then(
		function() {
            //var m = MakeContract.at(MakeContract.deployed().address);
			setStatus("RightsContract created");

            //Unsure of how this event works. callbacks are strange
            make.RightsContractCreated().watch(function(err, result) {
            if (err) {
                console.log(err);
                return;
            }
            console.log("contract creation event detected")
            console.log(result.args._value);
            addr = res//result.args._value;
            console.log(addr);
    	    setRightsContract(name, addr);
        });
        console.log("post event");

}).catch(function(e) {
		console.log(e);
		setStatus("Error creating RightsContract ");
		});
};

function setRightsContract(name, addr) {
    currentRCaddr = addr;
    var RC_name = document.getElementById("RightsContractAddr");
    var RC_addr = document.getElementById("RightsContractName");
    RC_name.innerHTML = name.valueOf();
    RC_addr.innerHTML = value.valueOf();
    currentRC = RightsContract.at(currentRCaddr);
};

function selectRightsContract() {
	var name = document.getElementById("selectRC").value;
    make.showContractAddr.call(name, {from: account}).then(function() {
        setRightscontract(name, value);
    }).catch(function(e) {
        console.log(e);
        setStatus("Error selecting rights contract");
    });
};

function addParty() {
	var addr;
	var name;
	var role;
	var rightsSplit;


	currentRC.makeParty(addr, name, role, rightsSplit, {from: account}).then(
			function() {
                //this is the contract event
                currentRC.PartyAdd().watch(function(err, result) {
                    if (err) {
                        console.log(err);
                        return;
                    }
                    console.log("party change detected");
                    console.log(res);
                });
			}).catch(function(e) {
					console.log(e);
					setStatus("Error adding parties");
	});
};

function removeParty() {
    var addr = document.getElementById("removePartyAddr").value;
    currentRC.removeParty(addr, {from: account}).then(
        function() {
            currentRC.PartyAdd().watch(function(err, result) {
                if (err) {
                    console.log(err);
                    return;
                }
                console.log("party change detected");
                console.log(res);
            });
        }).catch(function(e) {
            console.log(e);
            setStatus("Error removing parties");
        });
};

function createPC() {
    //TODO: ADD function to set PC in html, and in global scope
    currentRC.createPaymentContract({from: account}).then(
        function() {
            //this is the event listening for new payment contracts.
            //TODO: add parameter to specify which rights contract to listen to for new PC's
            currentRC.PaymentContractCreated().watch(function(err, result) {
                if (err) {
                    console.log(err);
                    return;
                }
                console.log("new payment contract detected")
                console.log(res);
            })
        }).catch(function(e) {
            console.log(e);
            setStatus("Error creating paymentcontract");
        });
};

function createMV() {
    currentRC.createMetaVoteContract({from: account}).then(
        function() {
            //this is the event listening for new payment contracts.
            //TODO: add parameter to specify which rights contract to listen to for new PC's
            currentRC.MetaVoteContractCreated().watch(function(err, result) {
                if (err) {
                    console.log(err);
                    return;
                }
                console.log("new metavote contract detected")
                console.log(res);
            })
        }).catch(function(e) {
            console.log(e);
            setStatus("Error creating metavote contract");
        });
};

function acceptContract() {
    currentRC.acceptTerms({from: account}).then(
        function() {
            console.log("contract accepted");
        }).catch(function(e) {
            console.log(e);
            console.log("error in accepting contract")
        });
    )
};

function createMetaProposal() {
    var newProposal = document.getElementById("newProposal").value;
    currentMV.createProposal(newProposal, {from: account}).then(
        function() {
            console.log("proposal created");
        }
    }).catch(function(e) {
        console.log(e);
        console.log("error in metaproposal creation");
    });
};

function voteForMetaProposal() {
    var addr;
    currentMV.vote(addr, {from: account}).then(
        function() {
            console.log("vote successful");
        }).catch(function(e) {
            console.log(e);
            console.log("voting error");
        });
};

function updateContractState() {
    console.log(MakeContract.deployed());
    //TODO: SHOW ALLL UPDATES here
}



function setStatus(message) {
  var status = document.getElementById("status");
  status.innerHTML = message;
};

function refreshBalance() {
  var meta = MetaCoin.deployed();

  meta.getBalance.call(account, {from: account}).then(function(value) {
    var balance_element = document.getElementById("balance");
    balance_element.innerHTML = value.valueOf();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error getting balance; see log.");
  });
};

function sendCoin() {
  var meta = MetaCoin.deployed();

  var amount = parseInt(document.getElementById("amount").value);
  var receiver = document.getElementById("receiver").value;

  setStatus("Initiating transaction... (please wait)");

  meta.sendCoin(receiver, amount, {from: account}).then(function() {
    setStatus("Transaction complete!");
    refreshBalance();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error sending coin; see log.");
  });
};

window.onload = function() {
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }

    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    account = accounts[0];

    refreshBalance();
  });
  }
