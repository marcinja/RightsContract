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
      throw new Error("RightsContractFactory error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("RightsContractFactory error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("RightsContractFactory contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of RightsContractFactory: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to RightsContractFactory.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: RightsContractFactory not deployed or address not set.");
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
        "name": "creator",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "name",
            "type": "bytes32"
          }
        ],
        "name": "initiateContract",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_name",
            "type": "bytes32"
          }
        ],
        "name": "showContractAddr",
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
            "name": "name",
            "type": "bytes32"
          }
        ],
        "name": "removeContract",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "remove",
        "outputs": [],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "name": "contracts",
        "outputs": [
          {
            "name": "",
            "type": "address"
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
            "name": "_name",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "_addr",
            "type": "address"
          }
        ],
        "name": "RightsContractCreated",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260008054600160a060020a031916331790556119ad806100246000396000f3606060405236156100565760e060020a600035046302d05d3f811461005857806304d6b8e31461006a5780630cdddb1114610093578063a43e04d8146100c2578063a7f43779146100ee578063ec56a37314610116575b005b6100af600054600160a060020a031681565b610056600435600081815260016020526040812054600160a060020a0316811461013757610002565b600435600090815260016020526040902054600160a060020a03165b600160a060020a03166060908152602090f35b610056600435600081815260016020526040812054600160a060020a031690818114156101ca57610002565b61005660005433600160a060020a03908116911614156102c757600054600160a060020a0316ff5b6100af600435600160205260009081526040902054600160a060020a031681565b60606116e4806102c9833901809050604051809103906000f0905080600160005060008460001916815260200190815260200160002060006101000a815481600160a060020a030219169083021790555080600160a060020a031682600019167f4c72d18f252e354e50c877f95cfb1815fe6b40594916460ac7dc06f4362f336860405180905060405180910390a35050565b7f7f93c75100000000000000000000000000000000000000000000000000000000606090815282918291637f93c751916064916020916004908290876161da5a03f115610002575050604051516003141590506102c25780600160a060020a03166357d3a786336040518260e060020a0281526004018082600160a060020a031681526020019150506020604051808303816000876161da5a03f1156100025750506040515190508061028c5750600054600160a060020a0390811633909116145b156102c257600160005060008460001916815260200190815260200160002060006101000a815490600160a060020a0302191690555b505050565b5660606040526000805460ff1916815560038190556005556116c0806100246000396000f3606060405236156101695760e060020a600035046310953b45811461016b578063170e944e146102685780631ea05640146102c4578063221c94b6146102ce5780632607ab20146103c55780632e90a7a5146103fe5780633341b4451461044f5780633cf0d6ad146104bd57806349c2a1a6146104f75780634e7d85b81461060157806357d3a786146106435780635fd8c7101461066b5780636811d3d9146106c85780636dd7d8ea146106e35780636e2123ee14610727578063730bd929146107755780637f93c751146107ec578063815af908146107fa57806388d7f41814610832578063898ac3fe1461089b57806390179bbb146108e5578063a9dd3ea31461098c578063b85a35d2146109db578063c040e6b8146109f0578063c1a42243146109fc578063c71daccb14610a87578063d8bff5a514610aa8578063dc31471e14610ac9578063e32a6e5f14610b1b578063eb8b981114610b29578063fdef666414610ba9575b005b60408051602060248035600481810135601f81018590048502860185019096528585526101699581359591946044949293909201918190840183828082843750506040805160209735808a0135601f81018a90048a0283018a01909352828252969897606497919650602491909101945090925082915084018382808284375094965050933593505050506040805160a0810182526000608082018181528252825160208181018552828252838101919091528284018290526060830182905233600160a060020a0316825260019052919091205460ff1615610d36576000805460ff161415610d365760055460649083011115610d3d57610002565b610c545b600080805b600354811015610f1d5760028054600791600091849081101561000257506000805160206116a0833981519152840154600160a060020a0316825260209290925260409020015490910190600101610271565b610c686003545b90565b6040805160206004803580820135601f8101849004840285018401909552848452610169949193602493909291840191908190840183828082843750506040805160208835808b0135601f810183900483028401830190945283835297999860449892975091909101945090925082915084018382808284375094965050505050505034600080805b600354831015610f395760028054849081101561000257506000805160206116a0833981519152840154600160a060020a0316600081815260076020908152604080832090940154600890915292902080549287049283019055948101946001949094019392509050610357565b61016933600160a060020a031660009081526001602052604081205460ff161561101657805460ff166003141561101657610fe061026c565b610c546004356000600760005060006002600050848154811015610002575050506000805160206116a0833981519152830154600160a060020a03168252602052604090206003015460ff16610666565b610c7a6004356009602090815260009182526040918290208054835160026001831615610100026000190190921691909104601f81018490048402820184019094528381529290918301828280156110445780601f1061101957610100808354040283529160200191611044565b610ce860043560006002600050828154811015610002575090526000805160206116a0833981519152810154600160a060020a0316610666565b6040805160206004803580820135601f810184900484028501840190955284845261016994919360249390929184019190819084018382808284375094965050505050505033600160a060020a031660009081526001602052604081205460ff161561104f575b6003548110156110535733600160a060020a0316600a60005060006002600050848154811015610002576000805160206116a08339815191520154600160a060020a039081168352602093909352506040902054161480156105f7575033600160a060020a03166002600050828154811015610002576000919091526000805160206116a08339815191520154600160a060020a031614155b156110c757610002565b61016933600160a060020a031660009081526001602052604090205460ff1615610641576000805460ff199081166003178255600b805490911690556004555b565b610c54600435600160a060020a03811660009081526001602052604090205460ff165b919050565b61016933600160a060020a031660009081526001602052604081205460ff161561101657600860205260408082208054908390559051909133600160a060020a031691839082818181858883f19350505050151561101657610002565b610c5460043560016020526000908152604090205460ff1681565b61016960043533600160a060020a031660009081526001602052604090205460ff161561101657600a60205260406000208054600160a060020a0319168217905550565b61016933600160a060020a031660009081526001602052604090205460ff16156106415760005460ff16600114156106415760005460ff1660031461064157600b805460ff19166001179055565b610c685b60008080808080805b6003548310156110ff5760028054600a916000918690811015610002576000805160206116a08339815191520154600160a060020a0390811683526020938452604080842054909116808452938a9052909120805460019081019091559490940193509150610782565b610c6860005460ff166102cb565b61016933600160a060020a031660009081526001602052604081205460ff161561101657805460ff16811415611016576111bb61026c565b610c7a60408051602081810183526000825282516006805460026001821615610100026000190190911604601f8101849004840283018401909552848252929390929183018282801561121e5780601f106111f35761010080835404028352916020019161121e565b61016933600160a060020a0316600090815260016020526040812054819060ff161561104f57805460ff166002148015906108db5750805460ff16600114155b1561122a57610002565b610c7a60043560408051602081019091526000808252600280546007929190859081101561000257506000805160206116a0833981519152850154600160a060020a031682526020928352604091829020805483516001821615610100026000190190911692909204601f810185900485028301850190935282825290929091908301828280156113c55780601f1061139a576101008083540402835291602001916113c5565b610c68600435600060076000506000600260005084815481101561000257506000805160206116a0833981519152850154600160a060020a031690915260209190915260409091200154610666565b6101696004356003546000146113d157610002565b610c6860005460ff1681565b6101696004356000610c80604051908101604052806064905b6000815260200190600190039081610a1557505033600160a060020a031660009081526001602052604081205481908190819060ff161561140357805460ff1681141561140357600160a060020a0387168152604081205460ff161580610a7d575060035481145b1561140c57610002565b610c6833600160a060020a03166000908152600860205260409020546102cb565b610ce8600435600a60205260009081526040902054600160a060020a031681565b610ce86004356000600a60005060006002600050848154811015610002575050506000805160206116a0833981519152830154600160a060020a03908116835260209190915260409091205416610666565b610c54600b5460ff166102cb565b610c7a60043560408051602081810183526000808352600160a060020a0385168152600982528390208054845160026001831615610100026000190190921691909104601f8101849004840282018401909552848152929390918301828280156113c55780601f1061139a576101008083540402835291602001916113c5565b610c7a60043560408051602081019091526000808252600280546007929190859081101561000257506000805160206116a0833981519152850154600160a060020a0316825260209283526040918290206001908101805484516101009382161593909302600019011692909204601f8101859004850282018501909352828152929091908301828280156113c55780601f1061139a576101008083540402835291602001916113c5565b604080519115158252519081900360200190f35b60408051918252519081900360200190f35b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600f02600301f150905090810190601f168015610cda5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b60408051600160a060020a03929092168252519081900360200190f35b5050506000928352506020909120018054600160a060020a0319168617905560058054830190556003805460010190555b5050505050565b50604080516080810182528481526020818101859052818301849052600060608301819052600160a060020a03881681526007825292832082518051825483875295849020949586959394859460026001841615610100026000190190931692909204601f90810182900483019490910190839010610ddf57805160ff19168380011785555b50610e0f9291505b80821115610e6e5760008155600101610dcb565b82800160010185558215610dc3579182015b82811115610dc3578251826000505591602001919060010190610df1565b50506020820151816001016000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610e7257805160ff19168380011785555b50610ea2929150610dcb565b5090565b82800160010185558215610e62579182015b82811115610e62578251826000505591602001919060010190610e84565b505060408281015160028381019190915560609390930151600392909201805460ff199081169093179055600160a060020a0388166000908152600160208190529190208054909216811790915581549081018083558281838015829011610d0557818360005260206000209182019101610d059190610dcb565b8160641415610f2f5760019250610f34565b600092505b505090565b84604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902086604051808280519060200190808383829060006004602084601f0104600f02600301f150905001915050604051809103902033600160a060020a03167ffc71ca374d789cccc9fb9258741cd962692a685bbb38110ecaec13732506fe9760405180905060405180910390a4505050505050565b1515610feb57610002565b50600480546001810190915560035403600019016000811415611016576000805460ff191681556004555b50565b820191906000526020600020905b81548152906001019060200180831161102757829003601f168201915b505050505081565b50505b5050565b816009600050600033600160a060020a031681526020019081526020016000206000509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106110cf57805160ff19168380011785555b5061104c929150610dcb565b60010161055e565b828001600101855582156110bb579182015b828111156110bb5782518260005055916020019190600101906110e1565b5060005b60035481101561119757838660006002600050848154811015610002576000805160206116a08339815191520154600160a060020a03168252506020919091526040902054111561118f578560006002600050838154811015610002576000805160206116a08339815191520154600160a060020a031682525060209190915260409020549094509250835b600101611103565b600354600290048411156111ad578496506111b2565b606596505b50505050505090565b15156111c657610002565b50600480546001810190915560035403600019016000811415611016576000805460ff1916600117905550565b820191906000526020600020905b81548152906001019060200180831161120157829003601f168201915b505050505090506102cb565b611232610779565b9150816065141561124257610002565b600280546009916000918590811015610002575081526000805160206116a08339815191528401819054906101000a9004600160a060020a0316600160a060020a0316815260200190815260200160002060005060066000509080546001816001161561010002031660029004828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106112f057805485555b5061132c929150610dcb565b828001600101855582156112e457600052602060002091601f016020900482015b828111156112e4578254825591600101919060010190611311565b50506000805460ff1916600217815590505b60035481101561104f5760028054600a9160009184908110156100025750506000805160206116a0833981519152830154600160a060020a03168152602091909152604090208054600160a060020a031916905560010161133e565b820191906000526020600020905b8154815290600101906020018083116113a857829003601f168201915b50505050509050610666565b600160a060020a03166000908152600160208190526040909120805460ff19169091179055565b600380546000190190555b50505050505050565b600354600160a060020a0388166000908152600160208181526040808420805460ff191690556007909152822080548382556000199485019a50909384926002908316156101000290910190911604601f81901061154757505b5060018201600050805460018160011615610100020316600290046000825580601f1061156557505b5050600060028201819055600391909101805460ff1916905592505b6003548310156115895786600160a060020a03166002600050848154811015610002576000919091526000805160206116a08339815191520154600160a060020a03161461158357600280548490811015610002576000805160206116a08339815191520154600160a060020a031690508584606481101561000257600160a060020a03929092166020929092020152600192909201916114ab565b601f0160209004906000526020600020908101906114669190610dcb565b601f01602090049060005260206000209081019061148f9190610dcb565b82935083505b8391505b858210156115f057600280546001840190811015610002576000919091526000805160206116a08339815191520154600160a060020a03168583606481101561000257600160a060020a039290921660209290920201526001919091019061158d565b60028054600080835591909152611619906000805160206116a083398151915290810190610dcb565b50600090505b858110156113f85760028054600181018083558281838015829011611661576000839052611661906000805160206116a0833981519152908101908301610dcb565b5050509190906000526020600020900160008784606481101561000257505050602083028701518154600160a060020a0319161790555060010161161f56405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace",
    "updated_at": 1470946603235,
    "links": {},
    "address": "0xba3650538170b21b4bbfe89eeb780c479e7127eb"
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

  Contract.contract_name   = Contract.prototype.contract_name   = "RightsContractFactory";
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
    window.RightsContractFactory = Contract;
  }
})();
