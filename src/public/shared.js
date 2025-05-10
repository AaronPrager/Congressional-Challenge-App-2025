// public/shared.js
import wixData from 'wix-data';

export function getUserName(userId) {
  // IMPORTANT: return the query promise!
  return wixData.query("Members/PrivateMembersData")
    .eq("_id", userId)
    .find()
    .then(res => {
      if (res.items.length) {
        const data = res.items[0];
        return data.nickname || "Member";
      }
      return "Member";
    })
    .catch(err => {
      console.error("Error fetching nickname:", err);
      return "Member";
    });
}

