 var accounts;
var account;
var balance;

var currentRCaddr;
var currentRC;
var paymentAllowed;

var drafted;
var payments;
var meta;
var invalid;

var factory = RightsContractFactory.deployed();

function toggleDisplay(docID) {
    var x = document.getElementById(docID);
    if (x.style.display === 'none') {
        x.style.display = 'block';
    } else {
        x.style.display = 'none';
    }
};

function loadStageHTML() {
    currentRC.getStage.call({from: account}).then(
        function(value){
            switch(value.toNumber()) {
                case 0:
                    drafted.style.display = 'block';
                    meta.style.display = 'block';
                    payments.style.display ='none';
                    invalid.style.display = 'block';
                    document.getElementById('setMetaButton').disabled = true;
                    break;
                case 1:
                    drafted.style.display ='none';
                    payments.style.display = 'block';
                    meta.style.display = 'block';
                    invalid.style.display ='block';
                    document.getElementById('setMetaButton').disabled = false;
                    break;
                case 2:
                    drafted.style.display = 'none';
                    payments.style.display = 'block';
                    meta.style.display = 'block';
                    invalid.style.display ='block';
                    document.getElementById('setMetaButton').disabled = false;
                    stage = "Published";
                    break;
                case 3:
                    drafted.style.display = 'none';
                    payments.style.display = 'none';
                    meta.style.display = 'none';
                    invalid.style.display ='block';
                    document.getElementById('setMetaButton').disabled = true;
                    document.getElementById('reinstate').disabled = false;
                    stage = "Invalid";
                    break;
            }
        }

    ).catch(function(e){
        console.log(e)
    })
};

function initRightsContract() {
    var name = document.getElementById("newRightsContract").value;
    var addr;

    //this event listens for new creation
    factory.RightsContractCreated().watch(function(err, result) {
    if (err) {
        console.log(err);
        return;
    }
    console.log("contract creation event detected");
    console.log("Addr:");
    addr = result.args._addr;
    console.log(addr);
    setRightsContract(name, addr);
    currentRC.setPermission(account, {from: account, gas: 999000}).then(
        function() {
            console.log("permission set");
        }).catch(function(e) {
            console.log(e);
    });
});
    factory.initiateContract(name, account, {from: account, gas: 1512100}).then(
	       function(value) {
            console.log(value);
        }).catch(function(e) {
		console.log(e);

		});
};

function setRightsContract(name, addr) {
    currentRCaddr = addr;
    var RC_name = document.getElementById("RightsContractAddr");
    var RC_addr = document.getElementById("RightsContractName");
    RC_name.innerHTML = name.valueOf();
    RC_addr.innerHTML = addr.valueOf();
    currentRC = RightsContract.at(currentRCaddr);
    loadStageHTML();
    updateContractState();
};

function selectRightsContract() {
	var name = document.getElementById("selectRC").value;
    factory.getContractAddr.call(name, {from: account}).then(function(value) {
        setRightsContract(name, value);
    }).catch(function(e) {
        console.log(e);
    });
};

function addParty() {
	var addr = document.getElementById("newPartyAddr").value;
	var name = document.getElementById("newPartyName").value;
	var role = document.getElementById("newPartyRole").value;
	var rightsSplit = document.getElementById("newPartySplit").value;

    console.log(addr, name, role, rightsSplit);
	currentRC.makeParty(addr, name, role, rightsSplit, {from: account, gas:750000}).then(
			function(value) {
                console.log("Party added: ");
                console.log(value);
			}).catch(function(e) {
					console.log(e);
	});
};

function removeParty() {
    //Add prompt to make sure!
    var addr = document.getElementById("removePartyAddr").value;
    var r = confirm("Are you sure you want to remove this party?");
    if (r == false){
        return;
    }
    currentRC.removeParty(addr, {from: account, gas: 750000}).then(
        function() {
            updateContractState();
        });
    };

function allowPayments() {
    currentRC.unlockPayments({from: account, gas:50000}).then(
        function() {
            paymentAllowed = true;
            updateContractState();
        }).catch(function(e) {
            console.log(e);
        });
};

function setNewMeta() {
    currentRC.setMetaHash({from: account, gas: 123123}).then(function(value) {
        console.log(value)
        }).catch(function(e) {
            console.log(e);
        });
};

function acceptContract() {
    currentRC.acceptTerms({from: account, gas: 123123}).then(
        function() {
            console.log("contract accepted");
            updateContractState();
        }).catch(function(e) {
            console.log(e);
            console.log("error in accepting contract")
        });
};

function createMetaProposal() {
    var newProposal = document.getElementById("newProposal").value;
    currentRC.createProposal(newProposal, {from: account, gas:500000}).then(
        function() {
            console.log("proposal created");
    }).catch(function(e) {
        console.log(e);
        console.log("error in metaproposal creation");
    });
};

function voteForMetaProposal() {
    var addr = document.getElementById("voteAddr").value;
    currentRC.vote(addr, {from: account, gas: 50000}).then(
        function() {
            console.log("vote successful");
        }).catch(function(e) {
            console.log(e);
            console.log("voting error");
        });
};

function getUserBalance() {
    var bal;
    currentRC.getBalance.call({from: account}).then(function(value) {
        console.log("User Balance retrieved");
        bal = value;
        document.getElementById("balanceCheck").innerHTML = bal;
    }).catch(function(e) {
        console.log(e);
        console.log("error in getting user balance");
    });
};

function withdraw() {
    currentRC.withdrawBalance({from: account, gas: 50000}).then(function(){
        console.log("Funds withdrawn");
        getUserBalance();
    }).catch(function(e) {
        console.log(e);
        console.log("error withdrawing funds");
    });
};

function sendEther() {
    var amount = web3.toWei(document.getElementById('paymentAmount').value, 'ether'); //Make sure this goes .toWei
    var sender = document.getElementById('paymentFrom').value;
    var purpose = document.getElementById('paymentPurpose').value;
    currentRC.sendPayment(sender, purpose, {from: account, gas:300000, value: amount}).then(function(value) {
        console.log(value);
        alert("Payment Sent");
    }).catch(function(e) {
        console.log(e);
        alert("Payment failed; Check console for error message");
    });
};

//TODO: list all payments! filter by purpose, or sender

function makeInvalid() {
    var r = confirm("Are you sure you want to claim this contract is invalid?");
    if (r == false){
        return;
    }
    currentRC.claimInvalid({from: account, gas: 120000}).then(function(value) {
        console.log(value);
        updateContractState();
    })
};

function voteReinstate() {
    var r = confirm("Are you sure want to reinstate the contract?");
    if (r == false){
        return;
    }
    currentRC.reinstateContract({from: account, gas: 500000}).then(function(value) {
        console.log(value);
        updateContractState();
    })
};

function updateContractState() {
    //TODO: change this first part to use Promise.all().then() style
    loadStageHTML();
    var c = document.getElementById("contractState");

    c.innerHTML = "<b>RightsContractFactory addr: </b>" + RightsContractFactory.deployed().address.valueOf() + "<br>";
    c.innerHTML += "<b>RightsContract addr: </b>" + currentRC.address + "<br><br>";

    currentRC.getStage.call({from: account}).then(
        function(value){
            x = "<b>Contract Stage: </b>";
            var stage;
            switch(value.toNumber()) {
                case 0:
                    stage = "Drafted";
                    break;
                case 1:
                    stage = "Accepted";
                    break;
                case 2:
                    stage = "Published";
                    break;
                case 3:
                    stage = "Invalid";
                    break;
            }
            x += stage + "<br><br>";
            c.innerHTML += x;
        }
    );

    var metadataHash;
    currentRC.getHash.call({from: account}).then(function(value) {
        metadataHash = value.valueOf();
        c.innerHTML += "<b>IPFS Hash: </b>" + metadataHash + "<br><br>";
        c.innerHTML += "<b>Direct link to IPFS gateway: </b> <a href=https://gateway.ipfs.io/ipfs/" + metadataHash +">https://gateway.ipfs.io/ipfs/" + metadataHash + "</a><br><br>";
    });

    var num;
    currentRC.getNumberPartyAddresses.call({from: account}).then(function(value) {
        num = value.toNumber();
        c.innerHTML += "<b>Number of parties: </b>" + num + "<br><br>";
        if (num != 0) {
            c.innerHTML += "<b>Participants</b><br><br>";
            getAllPartyInfo();
            c.innerHTML += "<br><br><b>Proposals and Votes</b><br>"
            getProposalsAndVotes();
        }
    });

    function getAllPartyInfo() {
        for (i = 0; i < num; i++) {
            Promise.all([
                currentRC.getAddrs.call(i, {from: account}),
                currentRC.getPartyName.call(i, {from: account}), currentRC.getPartyRole.call(i, {from: account}), currentRC.getPartySplit.call(i, {from: account}), currentRC.getPartyAccept.call(i, {from: account})]
            ).then(function(results){
                    var info = "<b>Address: </b>" + "<div id=\"addr" + i +"\">" + results[0].valueOf() +"</div>" + "<br><b>Name: </b>" + results[1].valueOf() + "<br><b>Role: </b>" + results[2].valueOf() + "<br><b>Split: </b>" + results[3].toNumber() + "<br><b>Accepted Contract: </b>" + results[4].toString() + "<br><br>";
                    c.innerHTML += info;
                }).catch(function(err){console.log(err);});
        }
    }

    function getProposalsAndVotes() {
        for (i = 0; i < num; i++) {
            var nextid = 'addr' + i.toString();
            nextid = '\'' + nextid + '\'';
            var x = document.getElementById(nextid).value;
            Promise.all([
                currentRC.getPartyVote.call(x, {from: account}),
                currentRC.getProposal.call(x, {from: account})]
            ).then(function(results) {
                c.innerHTML += "<b>Vote: </b>" + results[0].valueOf() +"<br><b>Proposal: </b>" + results[1].valueOf() + "<br>"
            });
        }
    };
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

    //TODO: Let users select default account from web3.eth.accounts[]
    accounts = accs;
    account = accounts[0];
  });

  drafted = document.getElementById('MakeRemoveParty');
  payments = document.getElementById('Payments');
  meta = document.getElementById('MetaVotePropose');
  invalid = document.getElementById('Invalid');

  drafted.style.display = payments.style.display = meta.style.display = invalid.style.display = 'none';
  }
