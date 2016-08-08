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
            "type": "uint256"
          }
        ],
        "name": "makeParty",
        "outputs": [],
        "type": "function"
      },
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
            "name": "_from",
            "type": "string"
          },
          {
            "name": "_purpose",
            "type": "string"
          }
        ],
        "name": "sendPayment",
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
        "name": "showPartyAccept",
        "outputs": [
          {
            "name": "_accepts",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "proposals",
        "outputs": [
          {
            "name": "",
            "type": "string"
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
        "constant": false,
        "inputs": [
          {
            "name": "_proposal",
            "type": "string"
          }
        ],
        "name": "createProposal",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "claimInvalid",
        "outputs": [],
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
        "name": "withdrawBalance",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "Permission",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "vote",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unlockPayments",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "checkVotes",
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
        "constant": false,
        "inputs": [],
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
        "name": "showPartyName",
        "outputs": [
          {
            "name": "_name",
            "type": "string"
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
        "name": "showPartySplit",
        "outputs": [
          {
            "name": "_split",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "setPermission",
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
        "constant": true,
        "inputs": [],
        "name": "checkBalance",
        "outputs": [
          {
            "name": "retVal",
            "type": "uint256"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "votes",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "showPaymentsUnlocked",
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
        "name": "getProposal",
        "outputs": [
          {
            "name": "_proposal",
            "type": "string"
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
        "name": "showPartyRole",
        "outputs": [
          {
            "name": "_role",
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
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "from",
            "type": "string"
          },
          {
            "indexed": true,
            "name": "purpose",
            "type": "string"
          }
        ],
        "name": "Payment",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040526000805460ff191681556003556114f18061001f6000396000f3606060405236156101535760e060020a600035046310953b458114610155578063170e944e146102525780631ea05640146102ae578063221c94b6146102b85780632e90a7a5146103af5780633341b445146104005780633cf0d6ad1461046957806349c2a1a6146104a35780634e7d85b8146105ad57806357d3a786146105ed5780635fd8c710146106155780636811d3d9146106725780636dd7d8ea1461068d5780636e2123ee146106d1578063730bd9291461071e5780637f93c751146107b8578063815af908146107dd57806388d7f41814610815578063898ac3fe1461087e57806390179bbb146108b7578063a9dd3ea31461095e578063b85a35d2146109ad578063c040e6b8146109da578063c1a42243146109e6578063c71daccb14610a6d578063d8bff5a514610a8e578063e32a6e5f14610aaf578063eb8b981114610abd578063fdef666414610b3d575b005b60408051602060248035600481810135601f81018590048502860185019096528585526101539581359591946044949293909201918190840183828082843750506040805160209735808a0135601f81018a90048a0283018a01909352828252969897606497919650602491909101945090925082915084018382808284375094965050933593505050506040805160a0810182526000608082018181528252825160208181018552828252838101919091528284018290526060830182905233600160a060020a0316825260019052919091205460ff1615610cca576000805460ff161415610cca5760055460649083011115610cd157610002565b610be85b600080805b600254811015610ead5760028054600791600091849081101561000257506000805160206114d1833981519152840154600160a060020a031682526020929092526040902001549091019060010161025b565b610bfc6003545b90565b6040805160206004803580820135601f8101849004840285018401909552848452610153949193602493909291840191908190840183828082843750506040805160208835808b0135601f810183900483028401830190945283835297999860449892975091909101945090925082915084018382808284375094965050505050505034600080805b600354831015610ec95760028054849081101561000257506000805160206114d1833981519152840154600160a060020a0316600081815260076020908152604080832090940154600890915292902080549287049283019055948101946001949094019392509050610341565b610be86004356000600760005060006002600050848154811015610002575050506000805160206114d1833981519152830154600160a060020a03168252602052604090206003015460ff16610610565b610c0e6004356009602090815260009182526040805192819020805460026001821615610100026000190190911604601f810184900484028501840190925281845291830182828015610f9b5780601f10610f7057610100808354040283529160200191610f9b565b610c7c60043560006002600050828154811015610002575090526000805160206114d1833981519152810154600160a060020a0316610610565b6040805160206004803580820135601f810184900484028501840190955284845261015394919360249390929184019190819084018382808284375094965050505050505033600160a060020a031660009081526001602052604081205460ff1615610fa6575b600354811015610faa5733600160a060020a0316600a60005060006002600050848154811015610002576000805160206114d18339815191520154600160a060020a039081168352602093909352506040902054161480156105a3575033600160a060020a03166002600050828154811015610002576000919091526000805160206114d18339815191520154600160a060020a031614155b1561101557610002565b61015333600160a060020a031660009081526001602052604090205460ff16156105eb576000805460ff19908116600317909155600b805490911690555b565b610be8600435600160a060020a03811660009081526001602052604090205460ff165b919050565b61015333600160a060020a031660009081526001602052604081205460ff161561104d57600860205260408082208054908390559051909133600160a060020a031691839082818181858883f19350505050151561104d57610002565b610be860043560016020526000908152604090205460ff1681565b61015360043533600160a060020a031660009081526001602052604090205460ff161561104d57600a60205260406000208054600160a060020a0319168217905550565b61015333600160a060020a031660009081526001602052604090205460ff16156105eb576000805460ff1614156105eb5760005460ff166003146105eb576000805460ff19166001179055565b610be85b600060006000600a60005060006002600050600081548110156100025750506000805160206114d183398151915254600160a060020a0390811690915260209190915260408220541691505b60035481101561105057600280548290811015610002576000919091526000805160206114d18339815191520154600160a060020a03908116908316146110595760009250610ec4565b610bfc6000805b60048110156107d95760005460ff16811415611061578091505b5090565b61015333600160a060020a031660009081526001602052604081205460ff161561104d57805460ff1681141561104d57611069610256565b610c0e60408051602081810183526000825282516006805460026001821615610100026000190190911604601f810184900484028301840190955284825292939092918301828280156110cc5780601f106110a1576101008083540402835291602001916110cc565b61015333600160a060020a031660009081526001602052604090205460ff16156105eb5760005460ff166003146105eb576110d8610722565b610c0e60043560408051602081019091526000808252600280546007929190859081101561000257506000805160206114d1833981519152850154600160a060020a031682526020928352604091829020805483516001821615610100026000190190911692909204601f8101859004850283018501909352828252909290919083018282801561121d5780601f106111f25761010080835404028352916020019161121d565b610bfc600435600060076000506000600260005084815481101561000257506000805160206114d1833981519152850154600160a060020a031690915260209190915260409091200154610610565b600160a060020a03600435166000908152600160208190526040909120805460ff19169091179055610153565b610bfc60005460ff1681565b6101536004356000610c80604051908101604052806064905b60008152602001906001900390816109ff57505033600160a060020a0316600090815260016020526040812054819060ff1615610cca57805460ff16811415610cca57600160a060020a0385168152604081205460ff161580610a63575060025481145b1561122957610002565b610bfc33600160a060020a03166000908152600860205260409020546102b5565b610c7c600435600a60205260009081526040902054600160a060020a031681565b610be8600b5460ff166102b5565b610c0e60043560408051602081810183526000808352600160a060020a0385168152600982528390208054845160026001831615610100026000190190921691909104601f81018490048402820184019095528481529293909183018282801561121d5780601f106111f25761010080835404028352916020019161121d565b610c0e60043560408051602081019091526000808252600280546007929190859081101561000257506000805160206114d1833981519152850154600160a060020a0316825260209283526040918290206001908101805484516101009382161593909302600019011692909204601f81018590048502820185019093528281529290919083018282801561121d5780601f106111f25761010080835404028352916020019161121d565b604080519115158252519081900360200190f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f168015610c6e5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b60408051600160a060020a03929092168252519081900360200190f35b5050506000928352506020909120018054600160a060020a0319168617905560058054830190556003805460010190555b5050505050565b50604080516080810182528481526020818101859052818301849052600060608301819052600160a060020a03881681526007825292832082518051825483875295849020949586959394859460026001841615610100026000190190931692909204601f90810182900483019490910190839010610d7357805160ff19168380011785555b50610da39291505b808211156107d95760008155600101610d5f565b82800160010185558215610d57579182015b82811115610d57578251826000505591602001919060010190610d85565b50506020820151816001016000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610e0257805160ff19168380011785555b50610e32929150610d5f565b82800160010185558215610df6579182015b82811115610df6578251826000505591602001919060010190610e14565b505060408281015160028381019190915560609390930151600392909201805460ff199081169093179055600160a060020a0388166000908152600160208190529190208054909216811790915581549081018083558281838015829011610c9957818360005260206000209182019101610c999190610d5f565b8160641415610ebf5760019250610ec4565b600092505b505090565b84604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902086604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167ffc71ca374d789cccc9fb9258741cd962692a685bbb38110ecaec13732506fe9760405180905060405180910390a4505050505050565b820191906000526020600020905b815481529060010190602001808311610f7e57829003601f168201915b505050505081565b50505b5050565b33600160a060020a0316600090815260096020908152604082208451815482855293839020919360026001821615610100026000190190911604601f90810184900483019391929187019083901061101d57805160ff19168380011785555b50610fa3929150610d5f565b60010161050a565b82800160010185558215611009579182015b8281111561100957825182600050559160200191906001019061102f565b50565b60019250610ec4565b60010161076e565b6001016107bf565b151561107457610002565b5060048054600181019091556003540360001901600081141561104d576000805460ff1916600117905550565b820191906000526020600020905b8154815290600101906020018083116110af57829003601f168201915b505050505090506102b5565b15156110e357610002565b60028054600991600091600a918391829081101561000257506000805160206114d183398151915254600160a060020a0390811690925260209283526040808520549092168452938252822080546006805494819052947ff652222313e28459528d920b65115c16c04f3efc82aaedc97be59f3f377c0d3f600186811615610100908102600019908101909816849004601f9081019790970483019791851615020190921604929091908390106111a557805485555b506111e1929150610d5f565b8280016001018555821561119957600052602060002091601f016020900482015b828111156111995782548255916001019190600101906111c6565b50506000805460ff19166002179055565b820191906000526020600020905b81548152906001019060200180831161120057829003601f168201915b50505050509050610610565b60028054600160a060020a0387166000908152600160208181526040808420805460ff1916905560079091528220805483825593985093919284929181161561010002600019011604601f81901061136657505b5060018201600050805460018160011615610100020316600290046000825580601f1061138457505b5050600060028201819055600391909101805460ff1916905591505b838210156113a257600280546001916000918590811015610002576000805160206114d18339815191520154600160a060020a0316825250602091909152604090205460ff161561135a57600280548390811015610002576000919091526000805160206114d18339815191520154600160a060020a03168383606481101561000257600160a060020a039290921660209290920201525b600191909101906112c2565b601f01602090049060005260206000209081019061127d9190610d5f565b601f0160209004906000526020600020908101906112a69190610d5f565b5060005b838110156113e85760028054600181018083558281838015829011611411576000839052611411906000805160206114d1833981519152908101908301610d5f565b6002805460008083559190915261144d906000805160206114d183398151915290810190610d5f565b505050919090600052602060002090016000858460648110156100025760200201518254600160a060020a0319161790915550506001016113a6565b50600280546064825560008290526000805160206114d1833981519152908101908590610c8082015b828111156114a25782518254600160a060020a0319161782556020929092019160019190910190611476565b506114c89291505b808211156107d9578054600160a060020a03191681556001016114aa565b5050505050505056405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace",
    "updated_at": 1470690573186,
    "links": {},
    "address": "0x15d73840d35a122630593aa591293cea51e6ef8c"
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
