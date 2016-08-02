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
          },
          {
            "indexed": true,
            "name": "prop",
            "type": "string"
          }
        ],
        "name": "ProposalAdded",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_addr",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "vote",
            "type": "address"
          }
        ],
        "name": "VoteAdded",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "_prop",
            "type": "string"
          }
        ],
        "name": "MetaUpdate",
        "type": "event"
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
    "unlinked_binary": "0x60606040526000600355600160a060020a033390811660009081526001602081905260408220805460ff199081169092179055815416905560068054600160a060020a031990811683179091556007805490911690911790556116d8806100666000396000f36060604052361561015e5760e060020a600035046310953b458114610160578063170e944e1461025d5780631ea05640146102b9578063221c94b6146102c35780632e90a7a5146103ba5780633341b4451461040b5780633cf0d6ad146104745780633cf17ee5146104ae57806349c2a1a6146104c25780634e7d85b81461058957806357d3a786146105c95780635fd8c710146105f15780636dd7d8ea1461064e5780636e2123ee146106cb578063730bd929146107195780637f93c7511461079e578063815af908146107c457806388d7f418146107fc578063898ac3fe146108655780638f0e0e951461089e57806390179bbb146108b2578063a9dd3ea314610959578063c040e6b8146109a8578063c1a42243146109b4578063c71daccb14610a3b578063cf057ac314610a5c578063d8bff5a514610a77578063e32a6e5f14610a98578063eb8b981114610aa6578063fdef666414610b26575b005b60408051602060248035600481810135601f810185900485028601850190965285855261015e9581359591946044949293909201918190840183828082843750506040805160209735808a0135601f81018a90048a0283018a01909352828252969897606497919650602491909101945090925082915084018382808284375094965050933593505050506040805160a0810182526000608082018181528252825160208181018552828252838101919091528284018290526060830182905233600160a060020a0316825260019052919091205460ff1615610cfa576000805460ff161415610cfa5760055460649083011115610d0157610002565b610bd15b600080805b600254811015610ee05760028054600991600091849081101561000257506000805160206116b8833981519152840154600160a060020a0316825260209290925260409020015490910190600101610266565b610be56003545b90565b6040805160206004803580820135601f810184900484028501840190955284845261015e949193602493909291840191908190840183828082843750506040805160208835808b0135601f810183900483028401830190945283835297999860449892975091909101945090925082915084018382808284375094965050505050505034600080805b600354831015610efc5760028054849081101561000257506000805160206116b8833981519152840154600160a060020a0316600081815260096020908152604080832090940154600c9091529290208054928704928301905594810194600194909401939250905061034c565b610bd16004356000600960005060006002600050848154811015610002575050506000805160206116b8833981519152830154600160a060020a03168252602052604090206003015460ff166105ec565b610bf7600435600a602090815260009182526040805192819020805460026001821615610100026000190190911604601f810184900484028501840190925281845291830182828015610fce5780601f10610fa357610100808354040283529160200191610fce565b610c6560043560006002600050828154811015610002575090526000805160206116b8833981519152810154600160a060020a03166105ec565b610c65600654600160a060020a03166102c0565b6040805160206004803580820135601f810184900484028501840190955284845261015e94919360249390929184019190819084018382808284375094965050505050505033600160a060020a031660009081526001602052604090205460ff161561104557600a6020908152604060009081208054845182845292849020919360026001831615610100026000190190921691909104601f908101829004830193929186019083901061104857805160ff19168380011785555b50610fd6929150610d91565b61015e33600160a060020a031660009081526001602052604090205460ff16156105c7576000805460ff19908116600317909155600d805490911690555b565b610bd1600435600160a060020a03811660009081526001602052604090205460ff165b919050565b61015e33600160a060020a031660009081526001602052604081205460ff161561104557600c60205260408082208054908390559051909133600160a060020a031691839082818181858883f19350505050151561104557610002565b61015e60043533600160a060020a031660009081526001602052604090205460ff161561104557600b602052604060008181208054600160a060020a031916841790559051600160a060020a038381169233909116917f3eda5cc71f18e7b2967dbce31be4a8eb203dda5832f3acc102c6c1703d8c1e199190a350565b61015e33600160a060020a031660009081526001602052604090205460ff16156105c75760005460ff16600114156105c75760005460ff166003146105c757600d805460ff19166001179055565b610bd15b6000808052600b6020527fdf7de25b7f1fd6d0b5205f0e18f1f35bd7b8d84cce336588d184533ce43a6f7654600160a060020a0316815b60035481101561107857600280548290811015610002576000919091526000805160206116b88339815191520154600160a060020a03908116908316146110815760009250610ef7565b610be55b6000805b60048110156107c05760005460ff16811415611089578091505b5090565b61015e33600160a060020a031660009081526001602052604081205460ff161561104557805460ff1681141561104557611091610261565b610bf760408051602081810183526000825282516008805460026001821615610100026000190190911604601f810184900484028301840190955284825292939092918301828280156110f45780601f106110c9576101008083540402835291602001916110f4565b61015e33600160a060020a031660009081526001602052604090205460ff16156105c75760005460ff166003146105c75761110061071d565b610c65600754600160a060020a03166102c0565b610bf760043560408051602081019091526000808252600280546009929190859081101561000257506000805160206116b8833981519152850154600160a060020a031682526020928352604091829020805483516001821615610100026000190190911692909204601f810185900485028301850190935282825290929091908301828280156112c05780601f10611295576101008083540402835291602001916112c0565b610be5600435600060096000506000600260005084815481101561000257506000805160206116b8833981519152850154600160a060020a0316909152602091909152604090912001546105ec565b610be560005460ff1681565b61015e6004356000610c80604051908101604052806064905b60008152602001906001900390816109cd57505033600160a060020a0316600090815260016020526040812054819060ff1615610cfa57805460ff16811415610cfa57600160a060020a0385168152604081205460ff161580610a31575060025481145b156112cc57610002565b610be533600160a060020a03166000908152600c60205260409020546102c0565b610bf7604080516020810190915260008082526115a66107a2565b610c65600435600b60205260009081526040902054600160a060020a031681565b610bd1600d5460ff166102c0565b610bf760043560408051602081810183526000808352600160a060020a0385168152600a82528390208054845160026001831615610100026000190190921691909104601f8101849004840282018401909552848152929390918301828280156112c05780601f10611295576101008083540402835291602001916112c0565b610bf760043560408051602081019091526000808252600280546009929190859081101561000257506000805160206116b8833981519152850154600160a060020a0316825260209283526040918290206001908101805484516101009382161593909302600019011692909204601f8101859004850282018501909352828152929091908301828280156112c05780601f10611295576101008083540402835291602001916112c0565b604080519115158252519081900360200190f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f168015610c575780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b60408051600160a060020a03929092168252519081900360200190f35b505050600092835250602091829020018054600160a060020a03191687179055600580548401905560038054600190810190915560408051600160a060020a03891681529283019190915280517f0a3ee74892bb97f9d632d73e351ffea50b4b7c8daccc5fdbac8bbf85b78f26c09281900390910190a15b5050505050565b50604080516080810182528481526020818101859052818301849052600060608301819052600160a060020a03881681526009825292832080548351805183875295849020949586959394859460026001861615610100026000190190951694909404601f908101829004850194929390910190839010610da557805160ff19168380011785555b50610dd59291505b808211156107c05760008155600101610d91565b82800160010185558215610d89579182015b82811115610d89578251826000505591602001919060010190610db7565b50506020820151816001016000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610e3457805160ff19168380011785555b50610e64929150610d91565b82800160010185558215610e28579182015b82811115610e28578251826000505591602001919060010190610e46565b505060408281015160028381019190915560039290920180546060949094015160ff19948516179055600160a060020a0388166000908152600160208190529190208054909316811790925580549182018082559091908281838015829011610c8257818360005260206000209182019101610c829190610d91565b8160641415610ef25760019250610ef7565b600092505b505090565b84604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902086604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167ffc71ca374d789cccc9fb9258741cd962692a685bbb38110ecaec13732506fe9760405180905060405180910390a4505050505050565b820191906000526020600020905b815481529060010190602001808311610fb157829003601f168201915b505050505081565b505080604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167f2fcb14d64bc8a67d910616e909d10ac37227b3d1b5298ec7a3d670ca84bdece460405180905060405180910390a35b50565b8280016001018555821561057d579182015b8281111561057d57825182600050559160200191906001019061105a565b60019250610ef7565b600101610754565b6001016107a6565b151561109c57610002565b50600480546001810190915560035403600019016000811415611045576000805460ff1916600117905550565b820191906000526020600020905b8154815290600101906020018083116110d757829003601f168201915b505050505090506102c0565b151561110b57610002565b7fdf7de25b7f1fd6d0b5205f0e18f1f35bd7b8d84cce336588d184533ce43a6f7654600160a060020a03166000908152600a60209081526040822080546008805494819052937ff3f7a9fe364faab93b216da50a3214154f22a0a2b415b23a84c8169e8b636ee36002600183811615610100908102600019908101909516839004601f9081019890980484019791861615029093019093169290920492908390106111c157805485555b506111fd929150610d91565b828001600101855582156111b557600052602060002091601f016020900482015b828111156111b55782548255916001019190600101906111e2565b50506008600050604051808280546001816001161561010002031660029004801561125f5780601f1061123d57610100808354040283529182019161125f565b820191906000526020600020905b81548152906001019060200180831161124b575b505060405190819003812092507f6e8e5597c248c8c695dcea1593891226d456cdb2ee61ebfdaf45a23154f482cc9150600090a2565b820191906000526020600020905b8154815290600101906020018083116112a357829003601f168201915b505050505090506105ec565b60028054600160a060020a0387166000908152600160208181526040808420805460ff1916905560099091528220805483825593985093919284929181161561010002600019011604601f8190106113fe57505b5060018201600050805460018160011615610100020316600290046000825580601f1061141c57505b5050600060028201819055600391909101805460ff1916905591505b8382101561143a57600280546001916000918590811015610002576000805160206116b88339815191520154600160a060020a0316825250602091909152604090205460ff16156113f257600280548390811015610002576000919091526000805160206116b88339815191520154600160a060020a031683836064811015610002575050602083028401525b60019190910190611365565b601f0160209004906000526020600020908101906113209190610d91565b601f0160209004906000526020600020908101906113499190610d91565b5060005b83811015611476576002805460018101808355828183801582901161149f5781836000526020600020918201910161149f9190610d91565b600280546000808355919091526114de906000805160206116b883398151915290810190610d91565b5050509190906000526020600020900160008584606481101561000257505050602083028501518154600160a060020a0319161790555060010161143e565b50600280546064825560008290526000805160206116b8833981519152908101908590610c8082015b828111156115335782518254600160a060020a0319161782556020929092019160019190910190611507565b506115599291505b808211156107c0578054600160a060020a031916815560010161153b565b505060408051600160a060020a03871681526000602082015281517f0a3ee74892bb97f9d632d73e351ffea50b4b7c8daccc5fdbac8bbf85b78f26c0929181900390910190a15050505050565b905080600014156115ec5760408051808201909152600781527f4472616674656400000000000000000000000000000000000000000000000000602082015291506107c0565b80600114156116305760408051808201909152600881527f4163636570746564000000000000000000000000000000000000000000000000602082015291506107c0565b80600214156116745760408051808201909152600981527f5075626c69736865640000000000000000000000000000000000000000000000602082015291506107c0565b80600314156107c05760408051808201909152600781527f496e76616c696400000000000000000000000000000000000000000000000000602082015291506107c056405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace",
    "updated_at": 1470169903696,
    "links": {},
    "address": "0xf5b9697433bfb6574b10f9d22acb927dc066a574"
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
