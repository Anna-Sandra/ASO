/** Marketplace listing sub-facets — **keep `value` ids aligned** with backend `backend/src/modules/products/productSubcategories.ts`. */

export const MARKETPLACE_SUBCATEGORY_OPTIONS = {
  food_drinks: [
    { value: "rice_dishes", label: "Rice dishes (jollof, waakye, fried rice)" },
    { value: "soups_stews", label: "Soups & stews" },
    { value: "swallows", label: "Swallows" },
    { value: "grills_proteins", label: "Grills & proteins" },
    { value: "snacks_small_chops", label: "Snacks & small chops" },
    { value: "drinks_smoothies", label: "Drinks & smoothies" },
    { value: "breakfast_food", label: "Breakfast" },
    { value: "desserts_pastries", label: "Desserts & pastries" }
  ],
  fashion_accessories: [
    { value: "shoes_footwear", label: "Shoes & footwear" },
    { value: "dresses_skirts", label: "Dresses & skirts" },
    { value: "tops_shirts", label: "Tops & shirts" },
    { value: "pants_trousers", label: "Pants & trousers" },
    { value: "bags_purses", label: "Bags & purses" },
    { value: "jewellery_watches", label: "Jewellery & watches" },
    { value: "traditional_wear", label: "Traditional wear (kente, ankara)" },
    { value: "sportswear", label: "Sportswear" },
    { value: "accessories_general", label: "Accessories (belts, caps, scarves)" }
  ],
  electronics_gadgets: [
    { value: "phones_tablets", label: "Phones & tablets" },
    { value: "laptops_computers", label: "Laptops & computers" },
    { value: "electronics_accessories", label: "Accessories (chargers, cases, cables)" },
    { value: "audio", label: "Audio" },
    { value: "cameras_photo", label: "Cameras & photography" },
    { value: "gaming", label: "Gaming" }
  ],
  beauty_personal_care: [
    { value: "skincare", label: "Skincare" },
    { value: "haircare", label: "Haircare" },
    { value: "makeup", label: "Makeup" },
    { value: "fragrances", label: "Fragrances & perfumes" },
    { value: "nail_care", label: "Nail care" },
    { value: "mens_grooming", label: "Men's grooming" }
  ],
  groceries_essentials: [
    { value: "grains_cereals", label: "Grains & cereals" },
    { value: "cooking_oils_condiments", label: "Cooking oils & condiments" },
    { value: "canned_packaged", label: "Canned & packaged foods" },
    { value: "beverages_grocery", label: "Beverages" },
    { value: "cleaning_supplies", label: "Cleaning supplies" },
    { value: "personal_hygiene", label: "Personal hygiene" }
  ],
  services: [
    { value: "tutoring_academic", label: "Tutoring & academic" },
    { value: "hair_beauty_service", label: "Hair & beauty services" },
    { value: "photography", label: "Photography & video" },
    { value: "design_creative", label: "Design & creative" },
    { value: "laundry_cleaning", label: "Laundry & cleaning" },
    { value: "tech_repairs", label: "Tech & repairs" },
    { value: "delivery_errands", label: "Delivery & errands" }
  ],
  books_academic: [
    { value: "textbooks", label: "Textbooks" },
    { value: "past_questions", label: "Past questions" },
    { value: "novels_fiction", label: "Novels & fiction" },
    { value: "notes_study_guides", label: "Notes & study guides" },
    { value: "stationery_office", label: "Stationery & office supplies" }
  ],
  babies_infants: [
    { value: "baby_clothing", label: "Clothing" },
    { value: "feeding_supplies", label: "Feeding" },
    { value: "diapers_hygiene", label: "Diapers & hygiene" },
    { value: "toys_learning", label: "Toys & learning" },
    { value: "nursery_furniture", label: "Nursery & furniture" }
  ]
};
