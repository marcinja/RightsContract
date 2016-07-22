Synopsis:

Decided to use multiple contracts for modularity. Even with a small amount of contracts, managing all permissions in one contract can lead to  errors; this should be easier to understand in the end.  (For example, options.sol already started to get unwieldy)

Questions/TODO:

Does mapping[something not in mapping] always equal 0x0? is it okay to check against just 0?

TODO: Configure contracts.yml correctly, with corrrect ordering and setup parameters.

TODO: Draw out diagram of complete contracts structure.

TODO: Rethink metadata data structure in RightsContract.
    Idea: Have string arrays for each "allowed" attribute in JSON (e.g. "artists") To add an artist who has some attributable copyright: Artist["Prince"]

    with arrays, how do we average out gas costs(across users) for resizing? Most common case for end user will be many cheap transactions + 1 resizing transaction that covers majority of costs.

TODO(?): Write "hidden" contracts:
    Let's say Drake has a ghost-writer who wants to legally own part of a work, but no part wishes it to be public. We can do a subcontract for the portions he splits off of everyone else. Maybe publish a commitment:
        H(contract addr || ghost addr || proportion || nonce)

        (proportion would be out of 10,000)

        in a situation where some party wishes to use this info, they can reveal the commitment, by showing the ghost addr and nonce. the owner of the ghost addr must then prove themselves (probably in meatspace)

TODO: Consider mutability for high-level contracts. Should the set of parties involved (i.e. artists, composers, managers, ...) be mutable? Currently that is set in stone. Maybe the "hidden" contracts could be reconfigured in someway for this to be possible.


TODO: Write unit tests



INIT:

MakeContract:
    contracts["MakeContract"] = addr




IDEAS: Contract naming, assuming participants immutable:

    Once user form is submitted, name = hash(p1 || p2 || ... || pn || current time). This is the "name" of the contract.

    Create IPFS (would be more interesting with IPLD) object with parties involved listed with address, name, role, etc. That hash is the name of the contract.

    Issues with this include: multiple recordings of the same song, same group of people working together (or imagine independent solo artist releasing her own work online)

    We don't want to have song names to be contract names either, to prevent squatting and fake contracts.




User fills out HTML table, one row at a time; we convert to JSON. Show JSON.stringify version in text box. ALSO make IPFS object of stringified (not sure if stringified , or plain data will work better). Display IPFS hash. 
