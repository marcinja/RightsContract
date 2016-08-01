//the instances of the contracts used

var currentRCaddr;
var currentMVaddr;
var currentPCaddr;

//Need to implement lots of constant functions,then can print out all important  facts about a contract


$(document).ready(function() {
    var contractCreation = MakeContract.RightsContractCreated();


    $("button.create").click(function() {
        var contractName = document.getElementById("createT").value.toString;
        console.log("Creating contract with name: ")
        console.log(contractName.toString());
        MakeContract.initiateContract(contractName);
        contractCreation.watch(function(err, result) {
            if (err) {
                console.log(err);
                return;
            }
            console.log("contract creation event detected")
            console.log(res);
            //check(res)
        })
        //Load create html file with new js running there
      });


    $("button.addParty").click(function() {
        //takes data from form, submits it. leaves in table.
        if (typeof currentRCaddr == "undefined"){
            console.log("Need RightsContract address")
        }
        console.log(currentRCaddr);
        currentRC = RightsContractContract.at(currentRCaddr);
        PartyAdded = currentRC.PartyAdd();

        //Taken from a submission form
        var addr;
        var name;
        var role;
        var rightsSplit;

        currentRC.makeParty(addr, name, role, rightsSplit);
        PartyAdded.watch(function(err, result) {
            if (err) {
                console.log(err);
                return;
            }
            console.log("party change detected");
            console.log(res);
            //check(res)
        })
    });

    $("button.removeParty").click(function() {
        //check box next to parties? while staging you can do this
        currentRC = RightsContractContract.at(currentRCaddr);
        PartyAdded = currentRC.PartyAdd();
        var addr;
        currenrRC.removePart(addr);
        PartyAdded.watch(function(err,result) {
            if (err){
                console.log(err);
                return;
            }
            console.log("party change detected");
            console.log(res);
        });
    });

    /*Next 2 functions should check if one of those contracts already exists, if
    so they shouldn't show up as buttons (the contracts can't be created anyway,
    but this looks nicer)*/
    $("button.createPC").click(function(){
        //create payment contract, and have callback watching for event
        currentRC = RightsContractContract.at(currentRCaddr);
        pcCreated = currentRC.PaymentContractCreated();

        currentRC.createPaymentContract();
        pcCreated.watch(function(err,result) {
            if (err){
                console.log(err);
                return;
            }
            console.log("payment contract created"); //should record contract addr also
            console.log(res);
        });
    }

    $("button.createMV").click(function(){
        currentRC = RightsContractContract.at(currentRCaddr);
        mvCreated = currentRC.MetaVoteContractCreated();

        currentRC.createPaymentContract();
        mvCreated.watch(function(err,result) {
            if (err){
                console.log(err);
                return;
            }
            console.log("metavote contract created"); //should record contract addr also
            console.log(res);
        });
    }

    $("button.acceptContract").click(function)() {
        currentRC = RightsContractContract.at(currentRCaddr);
        currentRC.acceptTerms();
    }

    $("button.createMetaProposal").click(function)() {
        currentRC = RightsContractContract.at(currentRCaddr);
        currentMV = MetaVoteContract.at(currentMVaddr);
        proposalAdded = currentMV.ProposalAdded;
        var newProposal;
        currentMV.createProposal(newProposal);
        proposalAdded.watch(function(err,result) {
            if (err){
                console.log(err);
                return;
            }
            console.log("proposal added:"); //should record contract addr also
            console.log(res);
        });
        //send proposal and check if it went through
        //should be tied to a submission form
    }

    $("button.voteForMetaProposal").click(function)() {
        //submissoin form where you type in the address (after all proposals are
        //shown and then click => boom
        //use publishMetaData()
        currentRC = RightsContractContract.at(currentRCaddr);
        currentMV = MetaVoteContract.at(currentMVaddr);
        voteAdded = currentMV.VoteAdded;
        var addr;
        currentMV.vote(addr);
        proposalAdded.watch(function(err,result) {
            if (err){
                console.log(err);
                return;
            }
            console.log("vote submitted for:"); //should record contract addr also
            console.log(res);
        });
    }

    $("button.showContractState").click(function(){
        //prints out all parties, current stage, + IPFS Meta data.
        // Needs to use helper functions(?)
        currentRC = RightsContractContract.at(currentRCaddr);
        console.log(currentRC.showMetaHash);

    });

});

//currentRC = RightsContractContract.at(addr)
