const { expect } = require("chai");
const { ethers } = require("hardhat");
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

// Add custom BigInt matcher
chai.use(function (chai, utils) {
  chai.Assertion.addMethod('near', function (value, delta) {
    const actual = this._obj;
    const expected = BigInt(value.toString());
    const difference = actual > expected ? actual - expected : expected - actual;
    const deltaBN = BigInt(delta.toString());
    
    this.assert(
      difference <= deltaBN,
      `expected ${actual} to be near ${expected} ± ${deltaBN}`,
      `expected ${actual} not to be near ${expected} ± ${deltaBN}`,
      expected,
      actual
    );
  });
});

describe("CrowdfundingPlatform", function() {
  let platform;
  let owner, donor, admin, other;

  beforeEach(async function() {
    [owner, donor, admin, other] = await ethers.getSigners();
    const Platform = await ethers.getContractFactory("CrowdfundingPlatform");
    platform = await Platform.deploy();
    await platform.changeAdmin(admin.address);
    
    // Create a test campaign first (index 0)
    await platform.createCampaign(
      "Test Campaign",
      "Description",
      "QmXYZ...",
      ethers.parseEther("10"),
      [ethers.parseEther("5"), ethers.parseEther("10")]
    );
  });

  describe("Campaign Creation", function() {
    it("Should create a campaign with correct parameters", async function() {
      const campaign = await platform.campaigns(0);
      expect(campaign.title).to.equal("Test Campaign");
      expect(campaign.owner).to.equal(owner.address);
    });

    it("Should reject empty title/description/image", async function() {
      await expect(platform.createCampaign("", "Desc", "Qm", 10, [5]))
        .to.be.rejectedWith("Title cannot be empty");
      await expect(platform.createCampaign("Title", "", "Qm", 10, [5]))
        .to.be.rejectedWith("Description cannot be empty");
      await expect(platform.createCampaign("Title", "Desc", "", 10, [5]))
        .to.be.rejectedWith("Image hash cannot be empty");
    });
  });

  describe("Donations", function() {
    it("Should accept donations and update totals", async function() {
      await platform.connect(donor).donate(0, {value: ethers.parseEther("3")});
      const donation = await platform.donations(0, donor.address);
      expect(donation).to.equal(ethers.parseEther("3"));
    });

    it("Should trigger milestones", async function() {
      const tx = await platform.connect(donor).donate(0, {value: ethers.parseEther("5")});
      const receipt = await tx.wait();
      
      const contract = await ethers.getContractAt("CrowdfundingPlatform", platform.target);
      const milestoneEvent = receipt.logs.map(log => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      }).find(event => event?.name === "MilestoneReached");
      
      expect(milestoneEvent).to.not.be.null;
      expect(milestoneEvent.args.campaignId).to.equal(0n);
      expect(milestoneEvent.args.milestone).to.equal(1n);
    });
  });

  describe("Withdrawals", function() {
    beforeEach(async function() {
      await platform.connect(donor).donate(0, {value: ethers.parseEther("8")});
    });

    it("Should allow owner to withdraw", async function() {
      const beforeBalance = await ethers.provider.getBalance(owner.address);
      const tx = await platform.withdrawFunds(0);
      const receipt = await tx.wait();
      
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const afterBalance = await ethers.provider.getBalance(owner.address);
      const expectedBalance = beforeBalance + ethers.parseEther("8") - gasUsed;
      
      // Use custom matcher
      expect(afterBalance).to.be.near(expectedBalance, ethers.parseEther("0.1"));
    });

    it("Should prevent non-owners from withdrawing", async function() {
      await expect(platform.connect(other).withdrawFunds(0))
        .to.be.rejectedWith("Only campaign owner");
    });
  });

  describe("Admin Functions", function() {
    it("Should allow admin to delete campaigns", async function() {
      await platform.connect(admin).adminDeleteCampaign(0);
      const campaign = await platform.campaigns(0);
      expect(campaign.exists).to.be.false;
    });

    it("Should prevent non-admins from deleting", async function() {
      await expect(platform.connect(other).adminDeleteCampaign(0))
        .to.be.rejectedWith("Only admin");
    });
  });

  describe("Refunds", function() {
    beforeEach(async function() {
      await platform.connect(donor).donate(0, {value: ethers.parseEther("2")});
      await platform.connect(admin).adminDeleteCampaign(0);
    });

    it("Should allow donors to refund when campaign inactive", async function() {
      const beforeBalance = await ethers.provider.getBalance(donor.address);
      const tx = await platform.connect(donor).refundDonation(0);
      const receipt = await tx.wait();
      
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const afterBalance = await ethers.provider.getBalance(donor.address);
      const expectedBalance = beforeBalance + ethers.parseEther("2") - gasUsed;
      
      // Use custom matcher
      expect(afterBalance).to.be.near(expectedBalance, ethers.parseEther("0.1"));
    });
  });
describe("User Campaign Management", function() {
    let platform;
    let owner, user1, user2;

    beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        const Platform = await ethers.getContractFactory("CrowdfundingPlatform");
        platform = await Platform.deploy();
        
        // Create test campaigns
        await platform.createCampaign("Campaign 1", "Desc", "Qm1", 10, [5]);
        await platform.connect(user1).createCampaign("Campaign 2", "Desc", "Qm2", 20, [10]);
        await platform.connect(user2).createCampaign("Campaign 3", "Desc", "Qm3", 30, [15]);
    });

    describe("getUserCampaigns", function() {
        it("Should return empty array for user with no campaigns", async function() {
            const campaigns = await platform.getUserCampaigns(ethers.ZeroAddress);
            expect(campaigns).to.deep.equal([]);
        });

        it("Should return correct campaigns for owner", async function() {
            const campaigns = await platform.getUserCampaigns(owner.address);
            expect(campaigns).to.deep.equal([0n]);
        });

        it("Should return correct campaigns for user1", async function() {
            const campaigns = await platform.getUserCampaigns(user1.address);
            expect(campaigns).to.deep.equal([1n]);
        });
    });

    describe("deleteCampaign", function() {
        it("Should allow owner to delete their campaign", async function() {
            await platform.deleteCampaign(0);
            const campaign = await platform.campaigns(0);
            expect(campaign.exists).to.be.false;
        });

        it("Should prevent deleting campaign with funds", async function() {
            await platform.connect(user1).donate(1, {value: ethers.parseEther("1")});
            await expect(platform.connect(user1).deleteCampaign(1))
                .to.be.rejectedWith("Cannot delete campaign with funds");
        });

        it("Should prevent others from deleting campaign", async function() {
            await expect(platform.deleteCampaign(1))
                .to.be.rejectedWith("Only campaign owner");
        });

        it("Should emit CampaignDeleted event", async function() {
            const tx = await platform.connect(user2).deleteCampaign(2);
            const receipt = await tx.wait();
            
            const contract = await ethers.getContractAt("CrowdfundingPlatform", platform.target);
            const event = receipt.logs.map(log => {
                try {
                    return contract.interface.parseLog(log);
                } catch {
                    return null;
                }
            }).find(e => e?.name === "CampaignDeleted");
            
            expect(event).to.not.be.null;
            expect(event.args.campaignId).to.equal(2n);
        });
    });
});

});