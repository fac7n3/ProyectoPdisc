import{s as e}from"./speed-insights-DT6Gw6Ig.js";import{_ as t,a as n,o as r,p as i,s as a,v as o,x as s,y as c}from"./cart-utils-BUbmojIg.js";import{i as l,r as u}from"./reviews-utils-Co--NLEJ.js";function d(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function f(t){let[{data:r,error:i},a,{data:{session:o}}]=await Promise.all([e.from(`products`).select(`id, title, description, price, compare_at_price, offer_expires_at, stock, image_url, stores(id, name, owner_id, delivery_fee, free_shipping_threshold), product_images(url, position), product_variants(id, name, price, stock)`).eq(`id`,t).single(),u(`product`,t),e.auth.getSession()]);if(i||!r)throw i||Error(`Producto no encontrado`);let s=new Date().toISOString().slice(0,10),c=!!(r.offer_expires_at&&r.offer_expires_at<s),l=!!(r.compare_at_price&&r.compare_at_price>r.price&&!c),f=l?Math.round((1-r.price/r.compare_at_price)*100):0,p=r.stores||{},m=(r.product_images||[]).slice().sort((e,t)=>e.position-t.position),h=[r.image_url||`/img/no-image.svg`,...m.map(e=>e.url)],g=p.free_shipping_threshold!=null&&r.price>=p.free_shipping_threshold,_;_=p.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:g||p.delivery_fee===0?`Envío gratis en este comercio.`:`Envío: ${n(p.delivery_fee)}`+(p.free_shipping_threshold?` (gratis desde ${n(p.free_shipping_threshold)})`:``);let v=``,y=``;l?(v=`-${f}%`,y=`descuento`):g&&(v=`Envío gratis`,y=`envio`);let b=a.average,x=a.count,S=b?Math.floor(b):0,C=b&&b-Math.floor(b)>=.5?1:0,w=Math.max(0,5-S-C),T=!!(o?.user?.id&&p.owner_id&&o.user.id===p.owner_id);return{id:r.id,isOwner:T,price:r.price,name:d(r.title||`Producto`),description:d(r.description||``),shop:d(p.name||`Comercio`),shopId:p.id||null,priceText:n(r.price),priceOldText:l?n(r.compare_at_price):``,discountText:l?`-${f}%`:``,images:h,imgSrc:h[0],imgAlt:d(r.title||`Producto`),shippingText:_,fullStars:S,halfStars:C,emptyStars:w,ratingCount:x,hasRating:x>0,badgeText:v,badgeType:y,stock:r.stock??0,variants:r.product_variants||[]}}function p(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function m(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function h(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<8&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<12&&r.push(t)}),r.slice(0,12)}function g(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function _(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Cargando producto...</p>
      </div>
    </div>
  `}function v(){return`
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
  `}function y(e){let t=m(e.stock),r=e.stock<=0,i=(e.shop||`?`).charAt(0).toUpperCase(),a=h(e.id,e.categories||[]),o=``;a.forEach(e=>{let t=d(e.querySelector(`.product-card__name`)?.textContent?.trim()||``),n=d(e.querySelector(`.product-card__price`)?.textContent||``),r=encodeURI(e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),i=d(e.id||``);o+=`
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
    `);let f=e.hasRating?`
      <div class="pm-rating__stars">${p(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,g=``;return e.variants.length>0&&(g=`
      <div class="pm-variants">
        <p class="pm-variants__title" style="font-weight:600; margin-bottom:0.4rem;">Opciones disponibles:</p>
        <ul class="pm-variants__list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.3rem;">
          ${e.variants.map(e=>`<li style="font-size:0.85rem; color:var(--bl-text-secondary);">${d(e.name)} — ${n(e.price)} (${e.stock>0?`stock: ${e.stock}`:`sin stock`})</li>`).join(``)}
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
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
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
            ${f}
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

          ${g}

          <!-- Quantity -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(e.stock,1)}" aria-label="Cantidad" ${r?`disabled`:``} />
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${r?`disabled`:``}>
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <!-- Actions -->
          ${e.isOwner?`
          <div class="pm-actions">
            <p class="pm-owner-notice"><i class="fa-solid fa-store" aria-hidden="true"></i> Este es tu producto -- así lo ven tus clientes.</p>
          </div>
          `:`
          <div class="pm-actions">
            ${r?`
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
            <div class="pm-shop-info__avatar">${i}</div>
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

      ${a.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__carousel">
            <button type="button" class="pm-related__nav pm-related__nav--prev" aria-label="Ver productos relacionados anteriores">
              <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="pm-related__scroll">
              ${o}
            </div>
            <button type="button" class="pm-related__nav pm-related__nav--next" aria-label="Ver más productos relacionados">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `:``}

    </div>
  `}var b=null,x=null,S=null;function C(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function w(){let e=history.state?.pmDepth||0;e>0?history.go(-e):E()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&document.getElementById(t);n?T(n,{skipHistoryPush:!0}):b&&E()});async function T(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}b&&E(),x=document.activeElement;let n=e.id,r=(e.dataset.category||``).split(` `);t||C(n);let i=document.createElement(`div`);i.className=`product-modal-overlay`,i.id=`pm-overlay`,i.innerHTML=_(),document.body.appendChild(i),b=i;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),i.offsetHeight,requestAnimationFrame(()=>i.classList.add(`is-open`)),i.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&w()}),S=e=>{e.key===`Escape`&&w()},document.addEventListener(`keydown`,S);try{let e=await f(n);if(e.categories=r,b!==i)return;i.innerHTML=y(e),D(i,e);let t=i.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),b!==i)return;i.innerHTML=v(),i.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>T(e))}}function E(){if(!b)return;b.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=b;b=null,S&&=(document.removeEventListener(`keydown`,S),null),setTimeout(()=>{e.remove()},400),x&&=(x.focus(),null)}function D(e,n){let u=e.querySelector(`.product-modal`),d=e.querySelector(`#pm-gallery`);d?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||d.classList.toggle(`is-zoomed`)});let f=e.querySelector(`#pm-gallery-img`);if(e.querySelectorAll(`.pm-thumb`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.thumbSrc;f&&n&&(f.src=n),e.querySelectorAll(`.pm-thumb`).forEach(e=>e.classList.remove(`is-active`)),t.classList.add(`is-active`)})}),n.shopId){let t=()=>{window.location.href=g(n.shopId)},r=e.querySelector(`#pm-shop-link`);r?.addEventListener(`click`,t),r?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,t)}let p=e.querySelector(`#pm-fav-btn`);if(p&&n.id){let e=p.querySelector(`i`),t=!1;a().then(r=>{t=r.includes(n.id),p.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t)}),p.addEventListener(`click`,async()=>{let r=t;t=!r,p.classList.toggle(`is-active`,t),e.classList.toggle(`fa-solid`,t),e.classList.toggle(`fa-regular`,!t),o(t?`Agregado a favoritos`:`Eliminado de favoritos`,t?`success`:`default`);try{await c(n.id,r)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let m=e.querySelector(`#pm-qty-value`),h=e.querySelector(`#pm-qty-minus`),_=e.querySelector(`#pm-qty-plus`);function v(){let e=parseInt(m.value,10)||1;h.disabled=e<=1,_.disabled=e>=n.stock}h?.addEventListener(`click`,()=>{let e=parseInt(m.value,10)||1;e>1&&(m.value=e-1),v()}),_?.addEventListener(`click`,()=>{let e=parseInt(m.value,10)||1;e<n.stock&&(m.value=e+1),v()}),m?.addEventListener(`change`,()=>{let e=parseInt(m.value,10)||1;e=Math.max(1,Math.min(e,n.stock)),m.value=e,v()});let y=e.querySelector(`#pm-add-cart`);y?.addEventListener(`click`,()=>{let e=parseInt(m?.value,10)||1,a=i(n.priceOldText),c=r(),l=c.find(e=>e.id===n.id);l?(l.qty+=e,l.selected=!0):c.push({id:n.id,name:n.name,shop:n.shop,price:n.price,priceOld:a||null,image:n.imgSrc,qty:e,selected:!0}),t(c),s(),y.classList.add(`pm-btn--added`);let u=y.innerHTML;y.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{y.classList.remove(`pm-btn--added`),y.innerHTML=u},1800),o(`${n.name} agregado al carrito (x${e})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let e=parseInt(m?.value,10)||1,a=i(n.priceOldText),o=r(),c=o.find(e=>e.id===n.id);c?(c.qty+=e,c.selected=!0):o.push({id:n.id,name:n.name,shop:n.shop,price:n.price,priceOld:a||null,image:n.imgSrc,qty:e,selected:!0}),t(o),s(),E();let l=window.location.pathname.includes(`/pages/`);window.location.href=l?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:n.name,text:`Mirá ${n.name} en Baradero Local por ${n.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),o(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),o(`¡Link copiado!`,`success`)}catch{}}});let b=e.querySelectorAll(`.pm-tab`),x=e.querySelectorAll(`.pm-tab-content`),S=!1;b.forEach(t=>{t.addEventListener(`click`,()=>{b.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),x.forEach(e=>e.classList.remove(`is-visible`)),t.classList.add(`is-active`),t.setAttribute(`aria-selected`,`true`);let r=t.dataset.tab,i=e.querySelector(`[data-tab-content="${r}"]`);if(i&&i.classList.add(`is-visible`),r===`reviews`&&!S){S=!0;let t=e.querySelector(`#pm-reviews-container`);t&&l(t,`product`,n.id,{hideForm:n.isOwner})}})}),e.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&(E(),setTimeout(()=>T(n),450))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let C=e.querySelector(`.pm-related__scroll`);if(C){let t=e.querySelector(`.pm-related__nav--prev`),n=e.querySelector(`.pm-related__nav--next`),r=e=>{let t=C.querySelector(`.pm-related-card`),n=t?t.getBoundingClientRect().width+14:174;C.scrollBy({left:e*n*2,behavior:`smooth`})},i=()=>{let e=C.scrollWidth-C.clientWidth,r=C.scrollLeft<=4,i=C.scrollLeft>=e-4;t&&(t.disabled=r),n&&(n.disabled=e<=4||i)};t?.addEventListener(`click`,()=>r(-1)),n?.addEventListener(`click`,()=>r(1)),C.addEventListener(`scroll`,i,{passive:!0}),i()}let w=u.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),D=w[0],O=w[w.length-1];u.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===D&&(e.preventDefault(),O.focus()):document.activeElement===O&&(e.preventDefault(),D.focus()))}),setTimeout(()=>D?.focus(),100)}function O(){document.querySelectorAll(`.products__grid`).forEach(e=>{e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`)||e.target.closest(`a[href]`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),T(t))})})}typeof window<`u`&&(window.initProductModal=O,window.openProductModal=T,window.closeProductModal=E);