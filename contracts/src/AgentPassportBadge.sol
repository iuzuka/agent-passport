// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface the Passport contract uses to mint badges.
interface IPassportBadge {
    function mint(address to, uint256 passportTokenId, uint256 milestone) external returns (uint256);
}

/// @title Agent Passport Badge
/// @notice Soulbound milestone badges for Agent Passport holders.
/// @dev
/// - Only the AgentPassport contract (set immutably at construction) may
///   mint. Nobody else — not even the owner — can mint a badge.
/// - Badges are SOULBOUND: every transfer reverts. Only mint (and internal
///   burn, which is not exposed) can move a token.
/// - Owner powers are MINIMAL: only setBaseURI(). No pause, no owner mint,
///   no fund withdrawal. No payable function, no receive/fallback.
contract AgentPassportBadge is ERC721, Ownable, IPassportBadge {
    /// @notice The only address allowed to mint badges: the Passport contract.
    address public immutable passport;

    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    /// @notice Milestone (3/7/14/21 days) unlocked by this badge.
    mapping(uint256 => uint256) public badgeMilestone;
    /// @notice Passport token id this badge was claimed from.
    mapping(uint256 => uint256) public badgePassportId;

    error NotPassport();
    error Soulbound();
    error ZeroAddress();

    event BadgeMinted(address indexed to, uint256 indexed tokenId, uint256 indexed passportTokenId, uint256 milestone);
    event BaseURISet(string baseURI);

    /// @param passportAddress Address of the AgentPassport contract.
    /// @param initialOwner    Owner of this contract (metadata admin only).
    constructor(address passportAddress, address initialOwner)
        ERC721("Agent Passport Badge", "APBADGE")
        Ownable(initialOwner)
    {
        if (passportAddress == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();
        passport = passportAddress;
    }

    /// @notice Mint a badge. Callable ONLY by the Passport contract.
    function mint(address to, uint256 passportTokenId, uint256 milestone) external override returns (uint256 tokenId) {
        if (msg.sender != passport) revert NotPassport();
        tokenId = _nextTokenId++;
        badgeMilestone[tokenId] = milestone;
        badgePassportId[tokenId] = passportTokenId;
        _safeMint(to, tokenId);
        emit BadgeMinted(to, tokenId, passportTokenId, milestone);
    }

    /// @notice Soulbound: transfers always revert (mint/burn internal only).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Set the metadata base URI. tokenURI = baseURI + tokenId.
    /// @dev The ONLY owner power in this contract.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURISet(baseURI_);
    }
}
