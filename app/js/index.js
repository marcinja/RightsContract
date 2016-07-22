

//Need to implement lots of constant functions,then can print out all important  facts about a contract
function check(addr){

}

$(document).ready(function() {


    $("button.create").click(function() {
        var value1 = document.getElementById("createT").value.toString;
        console.log("Creating contract with name: ")
        console.log(value1.toString());
        var _addr = MakeContract.initiateContract(value1);

        //Load create html file with new js running there

        check(_addr);

      });

    $("button.meta").click(function() {
            var textVal = document.getElementById("meta").value.toString;
            ipfs.add(new Buffer(textVal), function (err, res){
                if (err || !res) return console.error("ipfs add error", err, res)

                res.forEach(function (file) {
                    console.log("Succesfully stored", file.Hash);
                    display(file.Hash);
                });
            });
        });


    $("button.addParty").click(function() {
        //takes data from form, submits it. leaves in table.
    });

    $("button.removeParty").click(function() {
        //check box next to parties? while staging you can do this
    });

    $("button.showContractState").click(function(){
        //prints out all parties, current stage, + IPFS Meta data.
        // Needs to use helper functions(?)
    });


});
