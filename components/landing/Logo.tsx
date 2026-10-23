import Image from "next/image";

// The shop's logo: a saffron crown over a ruby in a double ring. public/logo.svg is the file the
// shop supplied, with its viewBox cropped to the mark; 997 × 1229 is that crop.
export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return <Image src="/logo.svg" alt="" width={997} height={1229} className={className} priority />;
}
