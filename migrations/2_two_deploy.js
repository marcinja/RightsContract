module.exports = function(deployer) {
  deployer.deploy(MakeContract);
  deployer.deploy(RightsContract);

 // deployer.autolink();
  //.deploy(MetaCoin);
};
