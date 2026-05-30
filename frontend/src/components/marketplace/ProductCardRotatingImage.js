import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { h } from "utils/h";
import { refFromId } from "config/catalog";
import { RefImage } from "components/ui";

/**
 * Product card image that cycles through imageUrls when a listing has multiple photos
 * (same behavior as Great value / Popular rails).
 */
export function ProductCardRotatingImage({
  product,
  wrapperClassName = "",
  imageClassName = "",
  linkTo,
  linkClassName = "",
  dotsClassName = "absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1",
  intervalMs = 2000
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const images =
    Array.isArray(product?.imageUrls) && product.imageUrls.length > 1 ? product.imageUrls : null;

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const timer = setInterval(() => {
      setImgIdx((prev) => (prev + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [images?.length, intervalMs]);

  const imageNode = h(RefImage, {
    key: images ? `pic-${imgIdx}` : "pic",
    src: images ? images[imgIdx] : product?.imageUrls?.[0],
    n: refFromId(product?.id),
    alt: product?.name || "",
    className: imageClassName
  });

  const dots =
    images && images.length > 1
      ? h(
          "div",
          { key: "dots", className: dotsClassName, "aria-hidden": true },
          images.map((_, i) =>
            h("span", {
              key: i,
              className: `rounded-full transition-all duration-300 ${
                i === imgIdx ? "h-1.5 w-3 bg-white" : "h-1.5 w-1.5 bg-white/50"
              }`
            })
          )
        )
      : null;

  const inner = [imageNode, dots].filter(Boolean);

  if (linkTo) {
    return h(
      Link,
      {
        to: linkTo,
        className: `${linkClassName || wrapperClassName} relative`.trim(),
        "aria-label": product?.name
      },
      inner
    );
  }

  return h("div", { className: `${wrapperClassName} relative`.trim() }, inner);
}
