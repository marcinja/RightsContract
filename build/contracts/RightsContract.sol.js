var Web3 = require("web3");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  return accept(tx, receipt);
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("RightsContract error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("RightsContract error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("RightsContract contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of RightsContract: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to RightsContract.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: RightsContract not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "checkSplit",
        "outputs": [
          {
            "name": "retVal",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showNumberPartyAddresses",
        "outputs": [
          {
            "name": "retVal",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_ipfsHash",
            "type": "string"
          }
        ],
        "name": "setMetaHash",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "i",
            "type": "uint256"
          }
        ],
        "name": "showAddrs",
        "outputs": [
          {
            "name": "retVal",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showPaymentsAddr",
        "outputs": [
          {
            "name": "retVal",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "claimInvalid",
        "outputs": [
          {
            "name": "retVal",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "checkPermission",
        "outputs": [
          {
            "name": "retVal",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "createMetaVoteContract",
        "outputs": [
          {
            "name": "retVal",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "checkStage",
        "outputs": [
          {
            "name": "retVal",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "acceptTerms",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showMetaHash",
        "outputs": [
          {
            "name": "retVal",
            "type": "string"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showMetaAddr",
        "outputs": [
          {
            "name": "retVal",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "i",
            "type": "uint256"
          }
        ],
        "name": "showParty",
        "outputs": [
          {
            "name": "_name",
            "type": "string"
          },
          {
            "name": "_role",
            "type": "string"
          },
          {
            "name": "_split",
            "type": "uint8"
          },
          {
            "name": "_accepts",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "createPaymentContract",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "stage",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_addr",
            "type": "address"
          }
        ],
        "name": "removeParty",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_addr",
            "type": "address"
          },
          {
            "name": "_name",
            "type": "string"
          },
          {
            "name": "_role",
            "type": "string"
          },
          {
            "name": "_rightsSplit",
            "type": "uint8"
          }
        ],
        "name": "makeParty",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showStage",
        "outputs": [
          {
            "name": "_stage",
            "type": "string"
          }
        ],
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "addr",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "added",
            "type": "bool"
          }
        ],
        "name": "PartyAdd",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "PaymentContractCreated",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "MetaVoteContractCreated",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6060604052600160a060020a03331660009081526001602081905260408220805460ff1990811690921790558154169055611c218061003e6000396000f3606060405236156100da5760e060020a6000350463170e944e81146100dc5780631ea056401461013b5780632e0b4ca2146101455780633cf0d6ad1461023a5780633cf17ee5146102745780634e7d85b81461028d57806357d3a786146102c35780636a748943146102eb5780637f93c751146103e6578063815af9081461040c57806388d7f418146104445780638f0e0e95146104ad578063ac66929e146104c1578063b14f6ee4146105bf578063c040e6b8146106b8578063c1a42243146106c4578063c7d40c921461074b578063cf057ac31461081e575b005b6108395b600080805b6002548110156108e9576002805460089160009184908110156100025750600080516020611c01833981519152840154600160a060020a0316825260209290925260409020015460ff16909101906001016100e5565b61084d6003545b90565b6040805160206004803580820135601f81018490048402850184019095528484526100da94919360249390929184019190819084018382808284375094965050505050505033600160a060020a031660009081526001602052604090205460ff161561090b5760005460ff1660031461090b5760078054825160008390527fa66cc928b5edb82af9bd49922954155ab7b0942694bea4ce44661d9a8736c688602060026001851615610100026000190190941693909304601f90810184900482019386019083901061090e57805160ff19168380011785555b506109089291505b808211156104085760008155600101610226565b61085f6004356000600260005082815481101561000257509052600080516020611c01833981519152810154600160a060020a03166102e6565b61085f6005546101009004600160a060020a0316610142565b61083933600160a060020a031660009081526001602052604081205460ff161561014257805460ff191660031790556001610142565b610839600435600160a060020a03811660009081526001602052604090205460ff165b919050565b61085f33600160a060020a0316600090815260016020526040812054819060ff161561040857805460ff1660011415610408576005546101009004600160a060020a031681146104085760405161087480611003833901809050604051809103906000f0905080600660006101000a815481600160a060020a030219169083021790555080600160a060020a031663042b52bc306040518260e060020a0281526004018082600160a060020a031681526020019150506000604051808303816000876161da5a03f1156100025750506040517f912456af8e5406c0aa726f83a6fddda6492e8410b2863a1386e15703aa4c81f6908490a25090565b61084d5b6000805b60048110156104085760005460ff1681141561093e578091505b5090565b6100da33600160a060020a031660009081526001602052604081205460ff161561090b57805460ff1681141561090b576109466100e0565b61087b60408051602081810183526000825282516007805460026001821615610100026000190190911604601f810184900484028301840190955284825292939092918301828280156109a95780601f1061097e576101008083540402835291602001916109a9565b61085f600654600160a060020a0316610142565b6040805160208181018352600080835283519182019093528281529091806040518080602001806020018560ff16815260200184151581526020018381038352878181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f1680156105545780820380516001836020036101000a031916815260200191505b508381038252868181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f1680156105ad5780820380516001836020036101000a031916815260200191505b50965050505050505060405180910390f35b6100da33600160a060020a031660009081526001602052604081205460ff161561090b57805460ff166001141561090b576005546101009004600160a060020a0316811461090b5760405161038a80611877833901809050604051809103906000f0905080600560016101000a815481600160a060020a030219169083021790555080600160a060020a031663042b52bc306040518260e060020a0281526004018082600160a060020a031681526020019150506000604051808303816000876161da5a03f1156100025750506040517f1ba705e824ce27a75868c6a6f2bedfe51fc4ae63e3cf4f50b9f34cd8f0463a4990600090a250565b61084d60005460ff1681565b6100da6004356000610c80604051908101604052806064905b60008152602001906001900390816106dd57505033600160a060020a0316600090815260016020526040812054819060ff16156109fc57805460ff168114156109fc57600160a060020a0385168152604081205460ff161580610741575060025481145b15610a0357610002565b60408051602060248035600481810135601f81018590048502860185019096528585526100da9581359591946044949293909201918190840183828082843750506040805160209735808a0135601f81018a90048a0283018a019093528282529698976064979196506024919091019450909250829150840183828082843750949650509335935050505033600160a060020a031660009081526001602052604090205460ff1615610d03576000805460ff161415610d0357600554606460ff91821683019091161115610d0957610002565b61087b60408051602081019091526000808252610ef06103ea565b604080519115158252519081900360200190f35b60408051918252519081900360200190f35b60408051600160a060020a039092168252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f1680156108db5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b8160ff16606414156108fe5760019250610903565b600092505b505090565b50505b50565b8280016001018555821561021e579182015b8281111561021e578251826000505591602001919060010190610920565b6001016103ee565b151561095157610002565b5060048054600181019091556003540360001901600081141561090b576000805460ff1916600117905550565b820191906000526020600020905b81548152906001019060200180831161098c57829003601f168201915b50505050509050610142565b505060408051600160a060020a03871681526000602082015281517f0a3ee74892bb97f9d632d73e351ffea50b4b7c8daccc5fdbac8bbf85b78f26c0929181900390910190a15b5050505050565b60028054600160a060020a0387166000908152600160208181526040808420805460ff1916905560089091528220805483825593985093919284929181161561010002600019011604601f819010610b2c57505b5060018201600050805460018160011615610100020316600290046000825580601f10610b4a57505b5050600201805461ffff19169055600091505b83821015610b685760028054600191600091859081101561000257600080516020611c018339815191520154600160a060020a0316825250602091909152604090205460ff1615610b205760028054839081101561000257600091909152600080516020611c018339815191520154600160a060020a031683836064811015610002575050602083028401525b60019190910190610a93565b601f016020900490600052602060002090810190610a579190610226565b601f016020900490600052602060002090810190610a809190610226565b5060005b83811015610ba45760028054600181018083558281838015829011610bcd57818360005260206000209182019101610bcd9190610226565b60028054600080835591909152610c0f90600080516020611c0183398151915290810190610226565b50505091909060005260206000209001600085846064811015610002575050815460208502870151600160a060020a0319909116179091555050600101610b6c565b5060028054606482556000829052600080516020611c01833981519152908101908590610c8082015b82811115610c645782518254600160a060020a0319161782556020929092019160019190910190610c38565b506109b59291505b80821115610408578054600160a060020a0319168155600101610c6c565b505050600092835250602091829020018054600160a060020a031916861790556005805460ff8116840160ff1990911617905560408051600160a060020a038716815260019281019290925280517f0a3ee74892bb97f9d632d73e351ffea50b4b7c8daccc5fdbac8bbf85b78f26c09281900390910190a15b50505050565b60806040519081016040528084815260200183815260200182815260200160008152602001506008600050600086600160a060020a031681526020019081526020016000206000506000820151816000016000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610dae57805160ff19168380011785555b50610dde929150610226565b82800160010185558215610da2579182015b82811115610da2578251826000505591602001919060010190610dc0565b50506020820151816001016000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610e3d57805160ff19168380011785555b50610e6d929150610226565b82800160010185558215610e31579182015b82811115610e31578251826000505591602001919060010190610e4f565b5050604082810151600292830180546060959095015160ff1995861690921761ff001916610100909202919091179055600160a060020a0387166000908152600160208190529190208054909316811790925580549182018082559091908281838015829011610c8a57818360005260206000209182019101610c8a9190610226565b90508060001415610f365760408051808201909152600781527f447261667465640000000000000000000000000000000000000000000000000060208201529150610408565b8060011415610f7a5760408051808201909152600881527f416363657074656400000000000000000000000000000000000000000000000060208201529150610408565b8060021415610fbe5760408051808201909152600981527f5075626c6973686564000000000000000000000000000000000000000000000060208201529150610408565b80600314156104085760408051808201909152600781527f496e76616c6964000000000000000000000000000000000000000000000000006020820152915061040856006060604052610862806100126000396000f3606060405236156100775760e060020a6000350463042b52bc81146100795780632a00ff10146100b45780633341b445146100c65780633712ff731461013357806349c2a1a61461014c5780636dd7d8ea14610273578063730bd92914610342578063d8bff5a51461042d578063eb8b98111461044e575b005b61007760043560008054600160a060020a0316146100b1576000805473ffffffffffffffffffffffffffffffffffffffff1916821790555b50565b6104d3600054600160a060020a031681565b6104f060043560016020818152600092835260409283902080548451600294821615610100026000190190911693909304601f810183900483028401830190945283835291929083018282801561059d5780601f106105725761010080835404028352916020019161059d565b61007760008054600160a060020a031690610600610346565b6040805160206004803580820135601f810184900484028501840190955284845261007794919360249390929184019190819084018382808284375050604080516000805460e160020a632be9d3c302835233600160a060020a039081169b84019b909b5292519799929092169788976357d3a786975082820196506020955093509083900301908290876161da5a03f115610002575050604051511590506105fc57816001600050600033600160a060020a031681526020019081526020016000206000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061077257805160ff19168380011785555b506107a29291505b80821115610814576000815560010161025f565b610077600435600080546040805160e160020a632be9d3c302815233600160a060020a0390811660048301529151929091169283926357d3a7869260248181019360209392839003909101908290876161da5a03f115610002575050604051511590506105fc576040805133600160a060020a0390811660008181526002602052938420805473ffffffffffffffffffffffffffffffffffffffff1916871790559085169290917f3eda5cc71f18e7b2967dbce31be4a8eb203dda5832f3acc102c6c1703d8c1e199190a35050565b61055e5b6000805481805260026020527fac33ff75c19e70fe83507db0d683fd3465c996598dc972688b7ace676c89077b54600160a060020a039182169116825b82600160a060020a0316631ea056406040518160e060020a0281526004018090506020604051808303816000876161da5a03f1156100025750506040515182101590506108185782600160a060020a0316633cf0d6ad826040518260e060020a028152600401808281526020019150506020604051808303816000876161da5a03f11561000257505060405151600160a060020a038481169116149050610823576000935061081d565b6104d3600435600260205260009081526040902054600160a060020a031681565b60408051602081810183526000808352600160a060020a03600435908116825260018084529185902080548651600294821615610100026000190190911693909304601f81018590048502840185019096528583526104f0959194939091908301828280156108565780601f1061082b57610100808354040283529160200191610856565b60408051600160a060020a03929092168252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f1680156105505780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b604080519115158252519081900360200190f35b820191906000526020600020905b81548152906001019060200180831161058057829003601f168201915b505050505081565b820191906000526020600020905b8154815290600101906020018083116105b3575b505060405190819003812092507f6e8e5597c248c8c695dcea1593891226d456cdb2ee61ebfdaf45a23154f482cc9150600090a25b5050565b151561060b57610002565b6001600050600083600160a060020a0316633cf0d6ad60006040518260e060020a028152600401808281526020019150506020604051808303816000876161da5a03f115610002575050604080518051600160a060020a031684526020858152919093207f2e0b4ca200000000000000000000000000000000000000000000000000000000845260048401918252805460029581161561010002600019011694909404602484018190529394509092632e0b4ca292859291829160440190849080156107185780601f106106ed57610100808354040283529160200191610718565b820191906000526020600020905b8154815290600101906020018083116106fb57829003601f168201915b5050925050506000604051808303816000876161da5a03f115610002575050508060405180828054600181600116156101000203166002900480156105c75780601f106105a55761010080835404028352918201916105c7565b82800160010185558215610257579182015b82811115610257578251826000505591602001919060010190610784565b505081604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167f2fcb14d64bc8a67d910616e909d10ac37227b3d1b5298ec7a3d670ca84bdece460405180905060405180910390a35050565b5090565b600193505b50505090565b600101610383565b820191906000526020600020905b81548152906001019060200180831161083957829003601f168201915b50505050509050919050566060604052610378806100126000396000f36060604052361561004b5760e060020a6000350463042b52bc8114610053578063221c94b61461008e5780632a00ff10146101ef5780635fd8c71014610201578063c71daccb146102a6575b6102ca610002565b6102ca60043560008054600160a060020a03161461008b576000805473ffffffffffffffffffffffffffffffffffffffff1916821790555b50565b608060206004803580820135601f8101849004909302840160405260608381526102ca9492936024939192840191819083828082843750506040805160208835808b0135601f810183900483028401830190945283835297999860449892975091909101945090925082915084018382808284375094965050505050505060008054600160a060020a031690349080805b84600160a060020a0316631ea056406040518160e060020a0281526004018090506020604051808303816000876161da5a03f1156100025750506040515184101590506102cc5784600160a060020a0316633cf0d6ad846040518260e060020a028152600401808281526020019150506020604051808303816000876161da5a03f1156100025750506040805151600160a060020a03811660009081526002602090815283822054600190915292902080549288029283019055958190039593509150506001929092019161011f565b6102c0600054600160a060020a031681565b600080547f57d3a786000000000000000000000000000000000000000000000000000000006060908152600160a060020a033381166064526102ca9392169081906357d3a7869060849060209060248188876161da5a03f115610002575050604051511590506103745760408051600160a060020a03331680855260016020529184208054908590559390849082818181858883f19350505050151561037457610002565b33600160a060020a03166000908152600160205260409020545b6060908152602090f35b005b85604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902087604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167ffc71ca374d789cccc9fb9258741cd962692a685bbb38110ecaec13732506fe9760405180905060405180910390a450505050505050565b505056405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace",
    "updated_at": 1470018023581,
    "links": {}
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "object") {
      Object.keys(name).forEach(function(n) {
        var a = name[n];
        Contract.link(n, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "RightsContract";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.1.2";

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.RightsContract = Contract;
  }
})();
