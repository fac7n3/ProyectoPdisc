import{u as e}from"./speed-insights-CicwkAbx.js";import{C as t,b as n,c as r,h as i,m as a,o,s,x as c,y as l}from"./dropdown-ClW7Mrkv.js";import{i as u,r as d}from"./reviews-utils-DFYxZxK1.js";function f(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function p(t){let[{data:n,error:r},i,{data:{session:s}}]=await Promise.all([e.from(`products`).select(`id, title, description, price, compare_at_price, offer_expires_at, stock, image_url, stores(id, name, owner_id, delivery_fee, free_shipping_threshold), product_images(url, position), product_variants(id, name, price, stock)`).eq(`id`,t).single(),d(`product`,t),e.auth.getSession()]);if(r||!n)throw r||Error(`Producto no encontrado`);let c=a(n),l=!!(n.compare_at_price&&n.compare_at_price>n.price&&!c),u=l?Math.round((1-n.price/n.compare_at_price)*100):0,p=n.stores||{},m=(n.product_images||[]).slice().sort((e,t)=>e.position-t.position),h=[n.image_url||`/img/no-image.svg`,...m.map(e=>e.url)],g=p.free_shipping_threshold!=null&&n.price>=p.free_shipping_threshold,_;_=p.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:g||p.delivery_fee===0?`Envío gratis en este comercio.`:`Envío: ${o(p.delivery_fee)}`+(p.free_shipping_threshold?` (gratis desde ${o(p.free_shipping_threshold)})`:``);let v=``,y=``;l?(v=`-${u}%`,y=`descuento`):g&&(v=`Envío gratis`,y=`envio`);let b=i.average,x=i.count,S=b?Math.floor(b):0,C=b&&b-Math.floor(b)>=.5?1:0,w=Math.max(0,5-S-C),T=!!(s?.user?.id&&p.owner_id&&s.user.id===p.owner_id);return{id:n.id,isOwner:T,price:n.price,name:f(n.title||`Producto`),description:f(n.description||``),shop:f(p.name||`Comercio`),shopId:p.id||null,priceText:o(n.price),priceOldText:l?o(n.compare_at_price):``,discountText:l?`-${u}%`:``,images:h,imgSrc:h[0],imgAlt:f(n.title||`Producto`),shippingText:_,fullStars:S,halfStars:C,emptyStars:w,ratingCount:x,hasRating:x>0,badgeText:v,badgeType:y,stock:n.stock??0,variants:n.product_variants||[]}}function m(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function h(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function g(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<8&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<12&&r.push(t)}),r.slice(0,12)}function _(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function v(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading" role="status" aria-live="polite">
        <div class="bl-spinner" aria-hidden="true">
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
          <div class="bl-spinner__dot"></div>
        </div>
        <p class="bl-loading-block__title">Cargando</p>
        <p class="bl-loading-block__subtitle">Esto puede tomar unos segundos…</p>
      </div>
    </div>
  `}function y(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Error al cargar el producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-modal-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>No se pudo cargar el producto.</p>
        <button type="button" class="pm-modal-error__retry" id="pm-retry-btn">Reintentar</button>
      </div>
    </div>
  `}function b(e){let t=h(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=g(e.id,e.categories||[]),a=``;i.forEach(e=>{let t=f(e.querySelector(`.product-card__name`)?.textContent?.trim()||``),n=f(e.querySelector(`.product-card__price`)?.textContent||``),r=encodeURI(e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),i=f(e.id||``);a+=`
      <div class="pm-related-card" data-related-id="${i}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `});let s=``;e.badgeText&&(s=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let c=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,l=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,u=``;e.images.length>1&&(u=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let d=e.hasRating?`
      <div class="pm-rating__stars">${m(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,p=``;return e.variants.length>0&&(p=`
      <div class="pm-variants">
        <p class="pm-variants__title" style="font-weight:600; margin-bottom:0.4rem;">Opciones disponibles:</p>
        <ul class="pm-variants__list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.3rem;">
          ${e.variants.map(e=>`<li style="font-size:0.85rem; color:var(--bl-text-secondary);">${f(e.name)} — ${o(e.price)} (${e.stock>0?`stock: ${e.stock}`:`sin stock`})</li>`).join(``)}
        </ul>
        <p style="font-size:0.75rem; color:var(--bl-text-muted); margin-top:0.3rem;">Para pedir una opción específica, consultá con el vendedor.</p>
      </div>
    `),`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${e.name}">

      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="pm-main">

        <div class="pm-gallery-col">
          <div class="pm-gallery" id="pm-gallery">
            ${s}
            ${e.isOwner?``:`
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            `}
            ${e.images.length>1?`
            <button class="pm-gallery__nav pm-gallery__nav--prev" id="pm-gallery-prev" aria-label="Imagen anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="pm-gallery__nav pm-gallery__nav--next" id="pm-gallery-next" aria-label="Imagen siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            `:``}
            <img class="pm-gallery__img" id="pm-gallery-img" src="${encodeURI(e.imgSrc)}" alt="${e.imgAlt}" />
          </div>
          ${u}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${d}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${l}
              ${c}
            </div>
            <div class="pm-shipping">
              ${e.shippingText}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${t.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${t.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${t.fillClass}"></div>
            </div>
          </div>

          ${p}

          <!-- Quantity: se muestra siempre, pero el dueño viendo su propia vista
               previa no puede sumar/restar (es solo una vista previa, no una compra) -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              `}
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(e.stock,1)}" aria-label="Cantidad" ${n||e.isOwner?`disabled`:``} />
              ${e.isOwner?``:`
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${n?`disabled`:``}>
                <i class="fa-solid fa-plus"></i>
              </button>
              `}
            </div>
          </div>

          <!-- Actions -->
          ${e.isOwner?`
          <div class="pm-actions">
            <p class="pm-owner-notice"><i class="fa-solid fa-store" aria-hidden="true"></i> Este es tu producto -- así lo ven tus clientes.</p>
          </div>
          `:`
          <div class="pm-actions">
            ${n?`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart" disabled>
              Sin stock
            </button>
            `:`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              Comprar ahora
            </button>
            `}
          </div>
          `}

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
          <button class="pm-tab" data-tab="reviews" role="tab" aria-selected="false">Reseñas${e.hasRating?` (${e.ratingCount})`:``}</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            ${e.description||`Producto de <strong>${e.shop}</strong>, disponible en tu zona. Comprando local apoyás a los comercios de Baradero.`}
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item">Vendido por ${e.shop}</div>
            <div class="pm-feature-item">${e.shippingText}</div>
            <div class="pm-feature-item">Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${r}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${e.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" id="pm-view-shop-btn" aria-label="Ver todos los productos de ${e.shop}">
              Ver tienda
            </button>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="reviews">
          <div id="pm-reviews-container">
            <p style="color: var(--bl-text-muted); font-size: 0.9rem;">Cargando reseñas...</p>
          </div>
        </div>
      </div>

      ${i.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__carousel">
            <button type="button" class="pm-related__nav pm-related__nav--prev" aria-label="Ver productos relacionados anteriores">
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="pm-related__scroll">
              ${a}
            </div>
            <button type="button" class="pm-related__nav pm-related__nav--next" aria-label="Ver más productos relacionados">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `:``}

    </div>
  `}var x=null,S=null,C=null;function w(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function T(){let e=history.state?.pmDepth||0;e>0?history.go(-e):D()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&document.getElementById(t);n?E(n,{skipHistoryPush:!0}):x&&D()});async function E(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}x&&D(),S=document.activeElement;let n=e.id,r=(e.dataset.category||``).split(` `);t||w(n);let i=document.createElement(`div`);i.className=`product-modal-overlay`,i.id=`pm-overlay`,i.innerHTML=v(),document.body.appendChild(i),x=i;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),i.offsetHeight,requestAnimationFrame(()=>i.classList.add(`is-open`)),i.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&T()}),C=e=>{e.key===`Escape`&&T()},document.addEventListener(`keydown`,C);try{let e=await p(n);if(e.categories=r,x!==i)return;i.innerHTML=b(e),O(i,e);let t=i.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),x!==i)return;i.innerHTML=y(),i.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>E(e))}}function D(){if(!x)return;x.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=x;x=null,C&&=(document.removeEventListener(`keydown`,C),null),setTimeout(()=>{e.remove()},400),S&&=(S.focus(),null)}function O(e,a){let o=e.querySelector(`.product-modal`),d=e.querySelector(`#pm-gallery`);d?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||e.target.closest(`.pm-gallery__nav`)||d.classList.toggle(`is-zoomed`)});let f=e.querySelector(`#pm-gallery-img`),p=Array.from(e.querySelectorAll(`.pm-thumb`)),m=0;function h(e){let t=a.images.length;if(t===0)return;m=(e%t+t)%t;let n=a.images[m];f&&n&&(f.src=encodeURI(n)),p.forEach((e,t)=>e.classList.toggle(`is-active`,t===m))}if(p.forEach((e,t)=>{e.addEventListener(`click`,()=>h(t))}),e.querySelector(`#pm-gallery-prev`)?.addEventListener(`click`,()=>h(m-1)),e.querySelector(`#pm-gallery-next`)?.addEventListener(`click`,()=>h(m+1)),a.shopId){let t=()=>{window.location.href=_(a.shopId)},n=e.querySelector(`#pm-shop-link`);n?.addEventListener(`click`,t),n?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,t)}let g=e.querySelector(`#pm-fav-btn`);if(g&&a.id){let e=g.querySelector(`i`),t=!1;r().then(n=>{t=n.includes(a.id),g.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t)}),g.addEventListener(`click`,async()=>{let r=t;t=!r,g.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t),n(t?`Agregado a favoritos`:`Eliminado de favoritos`,t?`success`:`default`);try{await c(a.id,r)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let v=e.querySelector(`#pm-qty-value`),y=e.querySelector(`#pm-qty-minus`),b=e.querySelector(`#pm-qty-plus`);function x(){let e=parseInt(v.value,10)||1;y.disabled=e<=1,b.disabled=e>=a.stock}y?.addEventListener(`click`,()=>{let e=parseInt(v.value,10)||1;e>1&&(v.value=e-1),x()}),b?.addEventListener(`click`,()=>{let e=parseInt(v.value,10)||1;e<a.stock&&(v.value=e+1),x()}),v?.addEventListener(`change`,()=>{let e=parseInt(v.value,10)||1;e=Math.max(1,Math.min(e,a.stock)),v.value=e,x()});let S=e.querySelector(`#pm-add-cart`);S?.addEventListener(`click`,()=>{let e=parseInt(v?.value,10)||1,r=i(a.priceOldText),o=s(),c=o.find(e=>e.id===a.id);c?(c.qty+=e,c.selected=!0):o.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:r||null,image:a.imgSrc,qty:e,selected:!0}),l(o),t(),S.classList.add(`pm-btn--added`);let u=S.innerHTML;S.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{S.classList.remove(`pm-btn--added`),S.innerHTML=u},1800),n(`${a.name} agregado al carrito (x${e})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let e=parseInt(v?.value,10)||1,n=i(a.priceOldText),r=s(),o=r.find(e=>e.id===a.id);o?(o.qty+=e,o.selected=!0):r.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:n||null,image:a.imgSrc,qty:e,selected:!0}),l(r),t(),D();let c=window.location.pathname.includes(`/pages/`);window.location.href=c?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:a.name,text:`Mirá ${a.name} en Baradero Local por ${a.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),n(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),n(`¡Link copiado!`,`success`)}catch{}}});let C=e.querySelectorAll(`.pm-tab`),w=e.querySelectorAll(`.pm-tab-content`),T=!1;C.forEach(t=>{t.addEventListener(`click`,()=>{C.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),w.forEach(e=>e.classList.remove(`is-visible`)),t.classList.add(`is-active`),t.setAttribute(`aria-selected`,`true`);let n=t.dataset.tab,r=e.querySelector(`[data-tab-content="${n}"]`);if(r&&r.classList.add(`is-visible`),n===`reviews`&&!T){T=!0;let t=e.querySelector(`#pm-reviews-container`);t&&u(t,`product`,a.id,{hideForm:a.isOwner})}})}),e.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&(D(),setTimeout(()=>E(n),450))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let O=e.querySelector(`.pm-related__scroll`);if(O){let t=e.querySelector(`.pm-related__nav--prev`),n=e.querySelector(`.pm-related__nav--next`),r=e=>{let t=O.querySelector(`.pm-related-card`),n=t?t.getBoundingClientRect().width+14:174;O.scrollBy({left:e*n*2,behavior:`smooth`})},i=()=>{let e=O.scrollWidth-O.clientWidth,r=O.scrollLeft<=4,i=O.scrollLeft>=e-4;t&&(t.disabled=r),n&&(n.disabled=e<=4||i)};t?.addEventListener(`click`,()=>r(-1)),n?.addEventListener(`click`,()=>r(1)),O.addEventListener(`scroll`,i,{passive:!0}),i()}let k=o.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),A=k[0],j=k[k.length-1];o.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===A&&(e.preventDefault(),j.focus()):document.activeElement===j&&(e.preventDefault(),A.focus()))}),setTimeout(()=>A?.focus(),100)}function k(){document.querySelectorAll(`.products__grid`).forEach(e=>{e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),E(t))})})}typeof window<`u`&&(window.initProductModal=k,window.openProductModal=E,window.closeProductModal=D);