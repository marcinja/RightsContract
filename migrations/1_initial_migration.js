module.exports = function(deployer) {
  deployer.deploy(RightsContractFactory);
  deployer.deploy(RightsContract);
};
/*

module.exports = function(deployer) {
  deployer.deploy(MakeContract);
 // deployer.autolink();
  //.deploy(MetaCoin);
};

*/
