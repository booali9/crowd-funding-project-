// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CrowdfundingPlatform {
    address public admin;
    
    struct Campaign {
        address owner;
        string title;
        string description;
        string imageHash; // IPFS hash for the image
        uint256 goalAmount;
        uint256 totalRaised;
        bool isActive;
        uint256[] milestones;
        uint256 currentMilestone;
        bool exists;
    }
    
    Campaign[] public campaigns;
    
    // Mapping to track donations per campaign
    mapping(uint256 => mapping(address => uint256)) public donations;
    
    event CampaignCreated(uint256 campaignId, address owner, string title);
    event DonationMade(uint256 campaignId, address donor, uint256 amount);
    event MilestoneReached(uint256 campaignId, uint256 milestone);
    event CampaignStopped(uint256 campaignId);

    event CampaignDeleted(uint256 campaignId);
    event FundsWithdrawn(uint256 campaignId, uint256 amount);
    event AdminChanged(address newAdmin);
    
    constructor() {
        admin = msg.sender;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }
    
    modifier onlyCampaignOwner(uint256 _campaignId) {
        require(_campaignId < campaigns.length, "Invalid campaign ID");
        require(campaigns[_campaignId].owner == msg.sender, "Only campaign owner can perform this action");
        _;
    }
    
    // Create a new campaign with image support
    function createCampaign(
        string memory _title,
        string memory _description,
        string memory _imageHash, // IPFS hash of the image
        uint256 _goalAmount,
        uint256[] memory _milestones
    ) public {
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_description).length > 0, "Description cannot be empty");
        require(bytes(_imageHash).length > 0, "Image hash cannot be empty");
        require(_milestones.length > 0, "At least one milestone required");
        require(_goalAmount > 0, "Goal amount must be positive");
        
        campaigns.push(Campaign({
            owner: msg.sender,
            title: _title,
            description: _description,
            imageHash: _imageHash,
            goalAmount: _goalAmount,
            totalRaised: 0,
            isActive: true,
            milestones: _milestones,
            currentMilestone: 0,
            exists: true
        }));
        
        emit CampaignCreated(campaigns.length - 1, msg.sender, _title);
    }
    
    // Donate to a campaign
    function donate(uint256 _campaignId) public payable {
        require(_campaignId < campaigns.length, "Invalid campaign ID");
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.exists, "Campaign does not exist");
        require(campaign.isActive, "Campaign is not active");
        require(msg.value > 0, "Donation amount must be positive");
        
        campaign.totalRaised += msg.value;
        donations[_campaignId][msg.sender] += msg.value;
        
        emit DonationMade(_campaignId, msg.sender, msg.value);
        
        // Check if current milestone is reached
        if (campaign.currentMilestone < campaign.milestones.length && 
            campaign.totalRaised >= campaign.milestones[campaign.currentMilestone]) {
            campaign.currentMilestone++;
            emit MilestoneReached(_campaignId, campaign.currentMilestone);
        }
    }
    
    // Stop the campaign (only owner can do this)
    function stopCampaign(uint256 _campaignId) public onlyCampaignOwner(_campaignId) {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.isActive, "Campaign is already stopped");
        
        campaign.isActive = false;
        emit CampaignStopped(_campaignId);
    }
    
    // Withdraw funds (only owner can do this)
    function withdrawFunds(uint256 _campaignId) public onlyCampaignOwner(_campaignId) {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.totalRaised > 0, "No funds to withdraw");
        
        uint256 amount = campaign.totalRaised;
        campaign.totalRaised = 0;
        
        (bool sent, ) = payable(campaign.owner).call{value: amount}("");
        require(sent, "Failed to send Ether");
        
        emit FundsWithdrawn(_campaignId, amount);
    }
    
    // Admin function to delete a campaign
    function adminDeleteCampaign(uint256 _campaignId) public onlyAdmin {
        require(_campaignId < campaigns.length, "Invalid campaign ID");
        require(campaigns[_campaignId].exists, "Campaign already deleted");
        
        // Before deleting, return funds to donors if any
        if (campaigns[_campaignId].totalRaised > 0) {
            campaigns[_campaignId].totalRaised = 0;
        }
        
        campaigns[_campaignId].exists = false;
        campaigns[_campaignId].isActive = false;
        
        emit CampaignDeleted(_campaignId);
    }
    
    // Change admin address
    function changeAdmin(address _newAdmin) public onlyAdmin {
        require(_newAdmin != address(0), "Invalid address");
        admin = _newAdmin;
        emit AdminChanged(_newAdmin);
    }
    
    // Get campaign count
    function getCampaignCount() public view returns (uint256) {
        return campaigns.length;
    }
    
    // Get active campaign count
    function getActiveCampaignCount() public view returns (uint256 count) {
        for (uint256 i = 0; i < campaigns.length; i++) {
            if (campaigns[i].exists && campaigns[i].isActive) {
                count++;
            }
        }
        return count;
    }
    
    // Get campaign details
    function getCampaign(uint256 _campaignId) public view returns (
        address owner,
        string memory title,
        string memory description,
        string memory imageHash,
        uint256 goalAmount,
        uint256 totalRaised,
        bool isActive,
        uint256[] memory milestones,
        uint256 currentMilestone
    ) {
        require(_campaignId < campaigns.length, "Invalid campaign ID");
        require(campaigns[_campaignId].exists, "Campaign does not exist");
        Campaign storage campaign = campaigns[_campaignId];
        return (
            campaign.owner,
            campaign.title,
            campaign.description,
            campaign.imageHash,
            campaign.goalAmount,
            campaign.totalRaised,
            campaign.isActive,
            campaign.milestones,
            campaign.currentMilestone
        );
    }

    // Add refund functionality for donors
function refundDonation(uint256 _campaignId) public {
    Campaign storage campaign = campaigns[_campaignId];
    require(!campaign.exists || !campaign.isActive, "Campaign still active");
    uint256 amount = donations[_campaignId][msg.sender];
    require(amount > 0, "No donations to refund");
    
    donations[_campaignId][msg.sender] = 0;
    (bool sent, ) = payable(msg.sender).call{value: amount}("");
    require(sent, "Refund failed");
}

function getUserCampaigns(address _user) public view returns (uint256[] memory) {
    uint256 count = 0;
    
    // First count how many campaigns the user has
    for (uint256 i = 0; i < campaigns.length; i++) {
        if (campaigns[i].owner == _user && campaigns[i].exists) {
            count++;
        }
    }
    
    // Then create and populate the result array
    uint256[] memory result = new uint256[](count);
    uint256 index = 0;
    
    for (uint256 i = 0; i < campaigns.length; i++) {
        if (campaigns[i].owner == _user && campaigns[i].exists) {
            result[index] = i;
            index++;
        }
    }
    
    return result;
}

/**
 * @notice Allows campaign owner to delete their own campaign
 * @param _campaignId The ID of the campaign to delete
 */
function deleteCampaign(uint256 _campaignId) public onlyCampaignOwner(_campaignId) {
    Campaign storage campaign = campaigns[_campaignId];
    
    require(campaign.exists, "Campaign already deleted");
    require(campaign.totalRaised == 0, "Cannot delete campaign with funds");
    
    campaign.exists = false;
    campaign.isActive = false;
    
    emit CampaignDeleted(_campaignId);
}

}