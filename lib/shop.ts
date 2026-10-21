// The shop's public details, shown on the landing page. A field left null hides the part of the
// page that needs it, so nothing half-filled or made up reaches customers.

type ShopDetails = {
  name: string;
  nameLocal: string;
  address: string[] | null; // one entry per line, e.g. ["Main Road, near the bus stand", "Town, District 4xxxxx"]
  mapUrl: string | null; // a Google Maps share link
  phone: string | null; // as it should be shown and dialled, e.g. "+91 98xxx xxxxx"
  whatsapp: string | null; // digits only, with the country code, e.g. "9198xxxxxxxx"
  hours: { days: string; time: string }[] | null; // e.g. [{ days: "Mon – Sat", time: "10 am – 8 pm" }]
};

export const shop: ShopDetails = {
  name: "Shri Ram Jewellers",
  nameLocal: "श्री राम ज्वेलर्स",
  address: null,
  mapUrl: null,
  phone: null,
  whatsapp: null,
  hours: null,
};

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export const whatsappHref = (number: string, text = "Hello, I would like to ask about a design.") =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
