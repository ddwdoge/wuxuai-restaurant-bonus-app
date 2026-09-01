const hiddenGiftStatuses = new Set(["redeemed", "redemption_started", "expired"]);

function customerGiftPriority(giftType) {
  if (giftType === "birthday") return 0;
  if (giftType === "welcome") return 1;
  return 2;
}

export function selectCustomerHomeGifts(rewards) {
  return rewards
    .filter((reward) => reward.active && reward.is_starter_reward && !hiddenGiftStatuses.has(reward.status))
    .sort((left, right) => {
      const priorityDifference = customerGiftPriority(left.gift_type) - customerGiftPriority(right.gift_type);
      if (priorityDifference !== 0) return priorityDifference;

      const leftValidity = left.valid_until ?? left.expires_at ?? "9999-12-31";
      const rightValidity = right.valid_until ?? right.expires_at ?? "9999-12-31";
      const validityDifference = leftValidity.localeCompare(rightValidity);
      if (validityDifference !== 0) return validityDifference;

      return (left.assignment_id ?? left.id).localeCompare(right.assignment_id ?? right.id);
    });
}
