pragma solidity ^0.6.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Ownable.sol";
import "./CloneLib.sol";

//Tokenbridge Arbitrary Message Bridge
interface IAMB {
    function messageSender() external view returns (address);

    function maxGasPerTx() external view returns (uint256);

    function transactionHash() external view returns (bytes32);

    function messageId() external view returns (bytes32);

    function messageSourceChainId() external view returns (bytes32);

    function messageCallStatus(bytes32 _messageId) external view returns (bool);

    function failedMessageDataHash(bytes32 _messageId)
        external
        view
        returns (bytes32);

    function failedMessageReceiver(bytes32 _messageId)
        external
        view
        returns (address);

    function failedMessageSender(bytes32 _messageId)
        external
        view
        returns (address);

    function requireToPassMessage(
        address _contract,
        bytes calldata _data,
        uint256 _gas
    ) external returns (bytes32);
}

interface ITokenMediator {
    function erc677token() external view returns (address);
    function bridgeContract() external view returns (address);
    function relayTokens(address _from, address _receiver, uint256 _value) external;
}


contract DataUnionFactorySidechain {
    event SidechainDUCreated(address indexed mainnet, address indexed sidenet, address indexed owner, address template);

    address public data_union_sidechain_template;
    IAMB public amb;
    ITokenMediator public token_mediator;

    constructor( address _token_mediator, address _data_union_sidechain_template) public {
        token_mediator = ITokenMediator(_token_mediator);
        data_union_sidechain_template = _data_union_sidechain_template;
        amb = IAMB(token_mediator.bridgeContract());
    }

    function sidechainAddress(address mainet_address)
        public view
        returns (address proxy)
    {
        return CloneLib.predictCloneAddressCreate2(data_union_sidechain_template, address(this), bytes32(uint256(mainet_address)));
    }

/*
    initialize(address _owner,
        address token_address,
        uint256 adminFeeFraction_,
        address[] memory agents,
        address _token_mediator,
        address _mainchain_DU)


    users can only deploy with salt = their key.
*/
    function deployNewDUSidechain(address owner, uint256 adminFeeFraction, address[] memory agents) public returns (address) {
        //if the request didnt come from AMB, use the sender's address as the corresponding "mainnet" address
        address du_mainnet = msg.sender == address(amb) ? amb.messageSender() : msg.sender;
        bytes32 salt = bytes32(uint256(du_mainnet));
        bytes memory data = abi.encodeWithSignature("initialize(address,address,uint256,address[],address,address)",
            owner,
            token_mediator.erc677token(),
            adminFeeFraction,
            agents,
            address(token_mediator),
            du_mainnet
        );
        address du = CloneLib.deployCodeAndInitUsingCreate2(CloneLib.cloneBytecode(data_union_sidechain_template), data, salt);
        emit SidechainDUCreated(du_mainnet, du, owner, data_union_sidechain_template);
        return du;
    }
}