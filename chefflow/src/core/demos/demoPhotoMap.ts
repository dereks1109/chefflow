// Cover photos for the canonical demo recipes. D1 stores the recipe row
// with an empty `coverPhoto` (keeps payloads under D1's row size budget
// and avoids pushing ~500KB-2MB of base64 per user to the server). The
// SPA enriches the cover at render time using the stable demo id.
//
// Once a user uploads their own cover photo, `recipe.coverPhoto` becomes
// non-empty and this map drops out — their custom photo takes precedence.

import ribeyePhoto from '../../assets/demo/ribeye.jpeg?inline';
import saladPhoto from '../../assets/demo/salad.jpeg?inline';
import soupPhoto from '../../assets/demo/tomatosoup.jpeg?inline';
import pepperSaucePhoto from '../../assets/demo/pepper-sauce.jpeg?inline';
import cucumberSoupPhoto from '../../assets/demo/(Demo) Chilled Cucumber Soup.jpeg?inline';
import scallopsPhoto from '../../assets/demo/(Demo) Pan-Seared Scallops with Lemon Butter.jpeg?inline';
import tunaTartarePhoto from '../../assets/demo/(Demo) Spicy Tuna Tartare.jpeg?inline';
import calamariPhoto from '../../assets/demo/(Demo) Crispy Fried Calamari.jpeg?inline';
import lambRackPhoto from '../../assets/demo/(Demo) Herb-Roasted Lamb Rack.jpeg?inline';
import swordfishPhoto from '../../assets/demo/(Demo) Grilled Swordfish Steak with Salsa Verde.jpeg?inline';
import porkBellyPhoto from '../../assets/demo/(Demo) Slow-Cooked Pork Belly.jpeg?inline';
import cremeBruleePhoto from '../../assets/demo/(Demo) Crème Brûlée.jpeg?inline';

const DEMO_PHOTOS: Record<string, string> = {
  r_demo_ribeye: ribeyePhoto,
  r_demo_salad: saladPhoto,
  r_demo_soup: soupPhoto,
  r_demo_pepper_sauce: pepperSaucePhoto,
  r_demo_cucumber_soup: cucumberSoupPhoto,
  r_demo_scallops: scallopsPhoto,
  r_demo_tuna_tartare: tunaTartarePhoto,
  r_demo_calamari: calamariPhoto,
  r_demo_lamb_rack: lambRackPhoto,
  r_demo_swordfish: swordfishPhoto,
  r_demo_pork_belly: porkBellyPhoto,
  r_demo_creme_brulee: cremeBruleePhoto,
  // The two without bundled JPEGs fall through to Unsplash URLs.
  r_demo_dumplings: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1600&q=80',
  r_demo_tikka_masala: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=1600&q=80',
};

/**
 * Returns the cover photo to render: whatever the user has set, or the
 * canonical demo photo if the user hasn't customized it. Empty string if
 * neither applies (render the placeholder).
 */
export function resolveCoverPhoto(recipe: { id: string; coverPhoto?: string }): string {
  if (recipe.coverPhoto) return recipe.coverPhoto;
  return DEMO_PHOTOS[recipe.id] ?? '';
}
