const BRANCH_PROXY_ENDPOINT = import.meta.env?.DEV
  ? "https://agenticspiros.com/demo/posokanei-basket/api/branches.php"
  : "./api/branches.php";

const RETAILER_ALIASES = {
  ab_vasilopoulos: ["ab", "αβ", "βασιλοπουλος", "vasilopoulos", "alpha beta"],
  galaxias: ["γαλαξιας", "galaxias"],
  halkiadakis: ["χαλκιαδακης", "halkiadakis"],
  kritikos: ["κριτικος", "kritikos"],
  lidl: ["lidl"],
  market_in: ["market in", "market-in"],
  masoutis: ["μασουτης", "masoutis"],
  mymarket: ["my market", "mymarket"],
  sklavenitis: ["σκλαβενιτης", "sklavenitis"],
  synka: ["συνκα", "συν.κα", "synka"],
};

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("geolocation_unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy || 0),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("geolocation_denied"));
          return;
        }
        reject(new Error("geolocation_failed"));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10 * 60 * 1000,
        timeout: 15000,
      },
    );
  });
}

export async function fetchNearbySupermarkets(position, radiusKm = 2) {
  const response = await fetch(BRANCH_PROXY_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: position.lat,
      lon: position.lon,
      radiusKm,
    }),
  });

  if (!response.ok) {
    throw new Error(`branches_http_${response.status}`);
  }

  const payload = await response.json();
  return normalizeStores(payload.elements || [], position);
}

export function buildRetailerProximity(retailers, stores) {
  const proximity = {};
  retailers.forEach((retailer) => {
    const matches = stores
      .filter((store) => retailerMatchesStore(retailer, store))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    proximity[retailer.id] = matches.length
      ? {
          nearest: matches[0],
          nearbyCount: matches.length,
          stores: matches.slice(0, 8),
        }
      : null;
  });
  return proximity;
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(1, Math.round(meters)).toLocaleString("el-GR")} μ.`;
  return `${(meters / 1000).toLocaleString("el-GR", {
    maximumFractionDigits: meters < 5000 ? 1 : 0,
  })} χλμ.`;
}

export function mapsSearchUrl(store) {
  if (!store) return "";
  const query = encodeURIComponent(`${store.lat},${store.lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function normalizeStores(elements, origin) {
  return elements
    .map((element) => {
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const tags = element.tags || {};
      const name = tags.name || tags.brand || tags.operator || "Supermarket";
      return {
        id: `${element.type}-${element.id}`,
        name,
        brand: tags.brand || "",
        operator: tags.operator || "",
        address: formatStoreAddress(tags),
        openingHours: tags.opening_hours || "",
        lat,
        lon,
        distanceMeters: distanceMeters(origin.lat, origin.lon, lat, lon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function retailerMatchesStore(retailer, store) {
  const haystack = normalizeText([
    store.name,
    store.brand,
    store.operator,
  ].filter(Boolean).join(" "));
  const aliases = [
    retailer.id,
    retailer.name,
    retailer.shortName,
    ...(RETAILER_ALIASES[retailer.id] || []),
  ]
    .filter(Boolean)
    .map(normalizeText)
    .filter((alias) => alias.length >= 2);

  return aliases.some((alias) => {
    if (alias === "ab" || alias === "αβ") {
      return haystack.split(/\s+/).includes(alias) || haystack.includes("αβ βασιλοπουλος");
    }
    return haystack.includes(alias);
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ς/g, "σ")
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatStoreAddress(tags) {
  const street = tags["addr:street"] || "";
  const number = tags["addr:housenumber"] || "";
  const city = tags["addr:city"] || tags["addr:suburb"] || "";
  return [street && `${street}${number ? ` ${number}` : ""}`, city].filter(Boolean).join(", ");
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
