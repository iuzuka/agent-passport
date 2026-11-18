// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {AgentPassportBadge, IPassportBadge} from "./AgentPassportBadge.sol";

/// @notice Minimal interface for the Agent ID token (ERC-721).
/// @dev Only balanceOf is needed: ownership is proven by holding at least 1.
interface IAgentId {
    function balanceOf(address account) external view returns (uint256);
}

/// @title Agent Passport
/// @notice Free, soulbound passport for Agent ID holders, with an on-chain
///         daily check-in streak and milestone badges.
/// @dev
/// - Mint is FREE (gas only), 1 per wallet, gated on holding an Agent ID.
/// - Passport is SOULBOUND: every transfer reverts. Only mint (and internal
///   burn, which is not exposed) can move a token.
/// - checkIn() is 1x per UTC day and requires the caller to still hold an
///   Agent ID at check-in time.
/// - Badges are minted by a separate contract (AgentPassportBadge) that only
///   this contract may call. One badge per milestone per holder.
/// - Owner powers are MINIMAL: only setBaseURI(). No pause, no owner mint,
///   no fund withdrawal. The contract has no payable function and no
///   receive/fallback, so it cannot hold native currency.
contract AgentPassport is ERC721, Ownable {
    using Strings for uint256;

    // ------------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------------

    /// @notice The Agent ID contract.
    address public constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    /// @notice Streak milestones that unlock a badge, in days.
    /// @dev Returned by a pure function because Solidity does not allow
    ///      constant arrays.
    function milestones() public pure returns (uint256[4] memory) {
        return [uint256(3), 7, 14, 21];
    }

    /// @notice Seconds per UTC day. A "day" is block.timestamp / 86400.
    uint256 public constant DAY_SECONDS = 86400;

    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------

    struct CheckInStats {
        uint64 lastCheckInDay; // UTC day number of the last check-in
        uint32 streak; // current consecutive-day streak
        uint32 totalCheckIns; // lifetime check-ins
        uint32 bestStreak; // longest streak ever reached
    }

    // ------------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------------

    IAgentId public immutable agentId;
    IPassportBadge public immutable badge;

    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    /// @notice Passport token id owned by a wallet (0 = none).
    mapping(address => uint256) public passportOf;

    /// @notice Check-in stats per passport token id.
    mapping(uint256 => CheckInStats) public checkIns;

    /// @notice Bitmask of claimed milestones per passport token id.
    ///         Bit i corresponds to MILESTONES[i].
    mapping(uint256 => uint256) public claimedMilestones;

    // ------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------

    error NotAgentIdHolder();
    error AlreadyHasPassport();
    error NoPassport();
    error Soulbound();
    error AlreadyCheckedInToday();
    error InvalidMilestone();
    error StreakTooLow(uint256 bestStreak, uint256 required);
    error BadgeAlreadyClaimed(uint256 milestone);
    error ZeroAddress();

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    event PassportMinted(address indexed holder, uint256 indexed tokenId);
    event CheckedIn(address indexed holder, uint256 indexed tokenId, uint64 indexed day, uint32 streak);
    event BadgeClaimed(address indexed holder, uint256 indexed tokenId, uint256 milestone, uint256 badgeTokenId);
    event BaseURISet(string baseURI);

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /// @param agentIdAddress Address of the Agent ID contract.
    /// @param initialOwner   Owner of this contract (metadata admin only).
    /// @dev This contract deploys its own AgentPassportBadge in the
    ///      constructor, so there is no chicken-and-egg address problem:
    ///      the badge's only minter is this contract from birth.
    constructor(address agentIdAddress, address initialOwner)
        ERC721("Agent Passport", "APASS")
        Ownable(initialOwner)
    {
        if (agentIdAddress == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();
        agentId = IAgentId(agentIdAddress);
        badge = IPassportBadge(address(new AgentPassportBadge(address(this), initialOwner)));
    }

    // ------------------------------------------------------------------------
    // Mint
    // ------------------------------------------------------------------------

    /// @notice Mint one free Passport. Caller must hold an Agent ID.
    /// @return tokenId The newly minted passport token id.
    function mint() external returns (uint256 tokenId) {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        if (passportOf[msg.sender] != 0) revert AlreadyHasPassport();

        tokenId = _nextTokenId++;
        passportOf[msg.sender] = tokenId;
        _safeMint(msg.sender, tokenId);
        emit PassportMinted(msg.sender, tokenId);
    }

    // ------------------------------------------------------------------------
    // Daily check-in
    // ------------------------------------------------------------------------

    /// @notice Check in once per UTC day. Requires holding a Passport AND
    ///         still holding an Agent ID. Updates the caller's streak.
    function checkIn() external {
        uint256 tokenId = passportOf[msg.sender];
        if (tokenId == 0) revert NoPassport();
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();

        uint64 today = uint64(block.timestamp / DAY_SECONDS);
        CheckInStats storage stats = checkIns[tokenId];
        if (today <= stats.lastCheckInDay) revert AlreadyCheckedInToday();

        if (today == stats.lastCheckInDay + 1) {
            stats.streak += 1;
        } else {
            stats.streak = 1;
        }
        stats.lastCheckInDay = today;
        stats.totalCheckIns += 1;
        if (stats.streak > stats.bestStreak) {
            stats.bestStreak = stats.streak;
        }

        emit CheckedIn(msg.sender, tokenId, today, stats.streak);
    }

    /// @notice Read a holder's check-in stats.
    function getCheckInStats(address holder) external view returns (CheckInStats memory) {
        return checkIns[passportOf[holder]];
    }

    // ------------------------------------------------------------------------
    // Milestone badges
    // ------------------------------------------------------------------------

    /// @notice Claim the badge for a milestone once bestStreak reaches it.
    ///         One badge per milestone per holder, forever.
    /// @param milestone One of 3, 7, 14, 21.
    /// @return badgeTokenId The newly minted badge token id.
    function claimBadge(uint256 milestone) external returns (uint256 badgeTokenId) {
        uint256 tokenId = passportOf[msg.sender];
        if (tokenId == 0) revert NoPassport();
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();

        uint256 index = _milestoneIndex(milestone); // reverts if not a milestone
        CheckInStats storage stats = checkIns[tokenId];
        if (stats.bestStreak < milestone) revert StreakTooLow(stats.bestStreak, milestone);

        uint256 bit = 1 << index;
        if (claimedMilestones[tokenId] & bit != 0) revert BadgeAlreadyClaimed(milestone);
        claimedMilestones[tokenId] |= bit;

        badgeTokenId = badge.mint(msg.sender, tokenId, milestone);
        emit BadgeClaimed(msg.sender, tokenId, milestone, badgeTokenId);
    }

    /// @notice True if this holder already claimed the badge for `milestone`.
    function hasClaimedBadge(address holder, uint256 milestone) external view returns (bool) {
        uint256 index = _milestoneIndex(milestone);
        return claimedMilestones[passportOf[holder]] & (1 << index) != 0;
    }

    function _milestoneIndex(uint256 milestone) internal pure returns (uint256) {
        uint256[4] memory m = milestones();
        for (uint256 i = 0; i < m.length; i++) {
            if (m[i] == milestone) return i;
        }
        revert InvalidMilestone();
    }

    // ------------------------------------------------------------------------
    // Soulbound: transfers always revert (mint/burn internal only)
    // ------------------------------------------------------------------------

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ------------------------------------------------------------------------
    // Metadata (owner: base URI only)
    // ------------------------------------------------------------------------

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
