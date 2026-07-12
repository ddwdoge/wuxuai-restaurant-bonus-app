import type {
  Campaign,
  Customer,
  LoyaltyRule,
  LoyaltySettings,
  Restaurant,
  RestaurantBranding,
  Reward,
  Coupon,
} from "../types/domain";

export const demoRestaurant: Restaurant = {
  id: "demo-restaurant",
  owner_id: "demo-user",
  name: "Kai Sushi",
  slug: "kai-sushi",
  status: "active",
  created_at: new Date().toISOString(),
};

export const demoBranding: RestaurantBranding = {
  id: "demo-branding",
  restaurant_id: demoRestaurant.id,
  logo_url: null,
  primary_color: "#0f766e",
  secondary_color: "#f4a261",
  button_color: "#0f766e",
  font_family: "Inter",
  created_at: new Date().toISOString(),
};

export const demoLoyaltySettings: LoyaltySettings = {
  id: "demo-loyalty",
  restaurant_id: demoRestaurant.id,
  loyalty_mode: "menu_points",
  amount_per_point: 1,
  stamps_required: 10,
  active: true,
  created_at: new Date().toISOString(),
};

export const demoLoyaltySettingsByMode: Record<LoyaltySettings["loyalty_mode"], LoyaltySettings> = {
  amount_based: {
    ...demoLoyaltySettings,
    id: "demo-loyalty-amount",
    loyalty_mode: "amount_based",
    amount_per_point: 1,
  },
  stamp_based: {
    ...demoLoyaltySettings,
    id: "demo-loyalty-stamp",
    loyalty_mode: "stamp_based",
    stamps_required: 10,
  },
  menu_points: demoLoyaltySettings,
};

export const demoLoyaltyRules: LoyaltyRule[] = [
  {
    id: "rule-euro",
    restaurant_id: demoRestaurant.id,
    title: "1 Euro = 1 Punkt",
    points: 1,
    stamps: 0,
    min_amount: 1,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-stamp",
    restaurant_id: demoRestaurant.id,
    title: "1 Besuch = 1 Stempel",
    points: 0,
    stamps: 1,
    min_amount: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-visit",
    restaurant_id: demoRestaurant.id,
    title: "Visit",
    points: 10,
    stamps: 0,
    min_amount: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-menu",
    restaurant_id: demoRestaurant.id,
    title: "Menu",
    points: 20,
    stamps: 0,
    min_amount: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule-family",
    restaurant_id: demoRestaurant.id,
    title: "Family Menü",
    points: 50,
    stamps: 0,
    min_amount: 0,
    active: true,
    created_at: new Date().toISOString(),
  },
];

export const demoCustomers: Customer[] = [
  {
    id: "cust-1",
    restaurant_id: demoRestaurant.id,
    name: "Mina Bauer",
    phone: "+43 660 000000",
    email: "mina@example.com",
    birthday: null,
    customer_code: "KAI-MINA-001",
    points_balance: 120,
    stamp_balance: 4,
    membership_level: "Gold",
    created_at: new Date().toISOString(),
  },
  {
    id: "cust-2",
    restaurant_id: demoRestaurant.id,
    name: "Lukas Stein",
    phone: null,
    email: "lukas@example.com",
    birthday: null,
    customer_code: "KAI-LUKAS-002",
    points_balance: 45,
    stamp_balance: 2,
    membership_level: "Standard",
    created_at: new Date().toISOString(),
  },
];

export const demoRewards: Reward[] = [
  {
    id: "reward-1",
    restaurant_id: demoRestaurant.id,
    title: "Gratis Mochi",
    description: "Ein Dessert beim nächsten Besuch.",
    reward_type: "reward",
    required_points: 100,
    required_stamps: 0,
    active: true,
    expires_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "reward-2",
    restaurant_id: demoRestaurant.id,
    title: "Gratis Lunch Drink",
    description: "Ein Getränk zum Mittagsmenü.",
    reward_type: "reward",
    required_points: 180,
    required_stamps: 0,
    active: true,
    expires_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "reward-stamp-1",
    restaurant_id: demoRestaurant.id,
    title: "10. Besuch gratis Dessert",
    description: "Stempelkarte voll machen und Dessert holen.",
    reward_type: "reward",
    required_points: 0,
    required_stamps: 10,
    active: true,
    expires_at: null,
    created_at: new Date().toISOString(),
  },
];

export const demoCoupons: Coupon[] = [
  {
    id: "coupon-1",
    restaurant_id: demoRestaurant.id,
    campaign_id: null,
    title: "5 Euro Sushi Coupon",
    description: "Einmaliger Coupon für den nächsten Besuch.",
    reward_type: "coupon",
    required_points: 80,
    required_stamps: 0,
    status: "active",
    expires_at: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "coupon-2",
    restaurant_id: demoRestaurant.id,
    campaign_id: null,
    title: "Family Menu Upgrade",
    description: "Upgrade nach 12 Stempeln.",
    reward_type: "coupon",
    required_points: 0,
    required_stamps: 12,
    status: "active",
    expires_at: null,
    created_at: new Date().toISOString(),
  },
];

export const demoCampaigns: Campaign[] = [
  {
    id: "camp-1",
    restaurant_id: demoRestaurant.id,
    title: "Lunch Bonus",
    slug: "lunch-bonus",
    description: "Registriere dich und sichere dir deinen Starter Coupon.",
    status: "active",
    start_date: null,
    end_date: null,
    starter_offer_source: "coupon",
    starter_reward_id: null,
    starter_coupon_id: "coupon-1",
    created_at: new Date().toISOString(),
  },
];

export const demoRedeemedOfferIds = ["reward-used"];

export const demoCampaignKpis = {
  scans: 42,
  registrations: 18,
  starterRewardsIssued: 18,
  conversionRate: 43,
};
