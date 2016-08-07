module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/"
  },
  rpc: {
    network_id: 12459,
    host: "localhost",
    port: 8545
  }
};

/*geth --datadir ~/Repos/MusicContract/local_eth --rpc --rpcport "8545" --rpccorsdomain "*" --nodiscover --networkid 12459 console */
