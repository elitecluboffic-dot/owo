export async function onRequestPost(context) {

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://owo.kraxx.my.id',
  };

  try {
    const body = await context.request.json();
    const { productKey, username, paymentMethod } = body;

    // .trim() untuk pastikan tidak ada spasi/enter tersembunyi
const MERCHANT_CODE = 'DS29842';
const API_KEY       = '2c3ec6a1c0d8b28b8515695aa14205da';
    

    if (!MERCHANT_CODE || !API_KEY) {
      return new Response(JSON.stringify({ error: 'Konfigurasi merchant tidak lengkap' }), {
        status: 500,
        headers: corsHeaders
      });
    }

    const PRODUCTS = {
      starter: { name:'Starter Pack',  cowoncy:1000,  price:5000   },
      basic:   { name:'Basic Pack',    cowoncy:5000,  price:20000  },
      pro:     { name:'Pro Pack',      cowoncy:15000, price:50000  },
      elite:   { name:'Elite Pack',    cowoncy:50000, price:150000 },
    };

    const p = PRODUCTS[productKey];
    if (!p) return new Response(JSON.stringify({ error: 'Produk tidak valid' }), {
      status: 400,
      headers: corsHeaders
    });

    if (!username || username.trim() === '') {
      return new Response(JSON.stringify({ error: 'Discord ID tidak boleh kosong' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const orderId = 'OWO-' + Date.now() + '-' + Math.random().toString(36).slice(2,7).toUpperCase();

    // Format: merchantCode + orderId + amount + apiKey
    const signatureRaw = MERCHANT_CODE + orderId + String(p.price) + API_KEY;
    const signature    = md5(signatureRaw);

    console.log('MERCHANT_CODE:', MERCHANT_CODE);
    console.log('orderId:', orderId);
    console.log('price:', p.price);
    console.log('signatureRaw:', signatureRaw);
    console.log('signature:', signature);

    const payload = {
      merchantCode:    MERCHANT_CODE,
      paymentAmount:   p.price,
      merchantOrderId: orderId,
      productDetails:  p.name + ' - ' + p.cowoncy + ' Cowoncy | Discord: ' + username.trim(),
      email:           'customer@example.com',
      paymentMethod:   paymentMethod,
      returnUrl:       'https://owo.kraxx.my.id',
      callbackUrl:     'https://owo.kraxx.my.id/api/payment-notification',
      signature:       signature,
      expiryPeriod:    60
    };

    const res  = await fetch('https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Duitku response:', JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      status:  200,
      headers: corsHeaders
    });

  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: corsHeaders
    });
  }
}

// MD5 helper (pure JS, tidak pakai crypto.subtle karena MD5 tidak didukung)
function md5(str) {
  function safeAdd(x,y){var lsw=(x&0xffff)+(y&0xffff);var msw=(x>>16)+(y>>16)+(lsw>>16);return(msw<<16)|(lsw&0xffff);}
  function bitRotateLeft(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|(~d)),a,b,x,s,t);}
  function md5blks(s){var i,blks=[];for(i=0;i<s.length+8;i+=16)blks.push(0);for(i=0;i<s.length;i++)blks[i>>2]|=s.charCodeAt(i)<<((i%4)*8);blks[i>>2]|=0x80<<((i%4)*8);blks[blks.length-2]=s.length*8;return blks;}
  function _md5(s){var blks=md5blks(s),i,a=1732584193,b=-271733879,c=-1732584194,d=271733878,olda,oldb,oldc,oldd;for(i=0;i<blks.length;i+=16){olda=a;oldb=b;oldc=c;oldd=d;a=md5ff(a,b,c,d,blks[i+0],7,-680876936);d=md5ff(d,a,b,c,blks[i+1],12,-389564586);c=md5ff(c,d,a,b,blks[i+2],17,606105819);b=md5ff(b,c,d,a,blks[i+3],22,-1044525330);a=md5ff(a,b,c,d,blks[i+4],7,-176418897);d=md5ff(d,a,b,c,blks[i+5],12,1200080426);c=md5ff(c,d,a,b,blks[i+6],17,-1473231341);b=md5ff(b,c,d,a,blks[i+7],22,-45705983);a=md5ff(a,b,c,d,blks[i+8],7,1770035416);d=md5ff(d,a,b,c,blks[i+9],12,-1958414417);c=md5ff(c,d,a,b,blks[i+10],17,-42063);b=md5ff(b,c,d,a,blks[i+11],22,-1990404162);a=md5ff(a,b,c,d,blks[i+12],7,1804603682);d=md5ff(d,a,b,c,blks[i+13],12,-40341101);c=md5ff(c,d,a,b,blks[i+14],17,-1502002290);b=md5ff(b,c,d,a,blks[i+15],22,1236535329);a=md5gg(a,b,c,d,blks[i+1],5,-165796510);d=md5gg(d,a,b,c,blks[i+6],9,-1069501632);c=md5gg(c,d,a,b,blks[i+11],14,643717713);b=md5gg(b,c,d,a,blks[i+0],20,-373897302);a=md5gg(a,b,c,d,blks[i+5],5,-701558691);d=md5gg(d,a,b,c,blks[i+10],9,38016083);c=md5gg(c,d,a,b,blks[i+15],14,-660478335);b=md5gg(b,c,d,a,blks[i+4],20,-405537848);a=md5gg(a,b,c,d,blks[i+9],5,568446438);d=md5gg(d,a,b,c,blks[i+14],9,-1019803690);c=md5gg(c,d,a,b,blks[i+3],14,-187363961);b=md5gg(b,c,d,a,blks[i+8],20,1163531501);a=md5gg(a,b,c,d,blks[i+13],5,-1444681467);d=md5gg(d,a,b,c,blks[i+2],9,-51403784);c=md5gg(c,d,a,b,blks[i+7],14,1735328473);b=md5gg(b,c,d,a,blks[i+12],20,-1926607734);a=md5hh(a,b,c,d,blks[i+5],4,-378558);d=md5hh(d,a,b,c,blks[i+8],11,-2022574463);c=md5hh(c,d,a,b,blks[i+11],16,1839030562);b=md5hh(b,c,d,a,blks[i+14],23,-35309556);a=md5hh(a,b,c,d,blks[i+1],4,-1530992060);d=md5hh(d,a,b,c,blks[i+4],11,1272893353);c=md5hh(c,d,a,b,blks[i+7],16,-155497632);b=md5hh(b,c,d,a,blks[i+10],23,-1094730640);a=md5hh(a,b,c,d,blks[i+13],4,681279174);d=md5hh(d,a,b,c,blks[i+0],11,-358537222);c=md5hh(c,d,a,b,blks[i+3],16,-722521979);b=md5hh(b,c,d,a,blks[i+6],23,76029189);a=md5hh(a,b,c,d,blks[i+9],4,-640364487);d=md5hh(d,a,b,c,blks[i+12],11,-421815835);c=md5hh(c,d,a,b,blks[i+15],16,530742520);b=md5hh(b,c,d,a,blks[i+2],23,-995338651);a=md5ii(a,b,c,d,blks[i+0],6,-198630844);d=md5ii(d,a,b,c,blks[i+7],10,1126891415);c=md5ii(c,d,a,b,blks[i+14],15,-1416354905);b=md5ii(b,c,d,a,blks[i+5],21,-57434055);a=md5ii(a,b,c,d,blks[i+12],6,1700485571);d=md5ii(d,a,b,c,blks[i+3],10,-1894986606);c=md5ii(c,d,a,b,blks[i+10],15,-1051523);b=md5ii(b,c,d,a,blks[i+1],21,-2054922799);a=md5ii(a,b,c,d,blks[i+8],6,1873313359);d=md5ii(d,a,b,c,blks[i+15],10,-30611744);c=md5ii(c,d,a,b,blks[i+6],15,-1560198380);b=md5ii(b,c,d,a,blks[i+13],21,1309151649);a=md5ii(a,b,c,d,blks[i+4],6,-145523070);d=md5ii(d,a,b,c,blks[i+11],10,-1120210379);c=md5ii(c,d,a,b,blks[i+2],15,718787259);b=md5ii(b,c,d,a,blks[i+9],21,-343485551);a=safeAdd(a,olda);b=safeAdd(b,oldb);c=safeAdd(c,oldc);d=safeAdd(d,oldd);}
  var hex='';var chars=[a,b,c,d];for(var j=0;j<4;j++){var n=chars[j];for(var k=0;k<4;k++){hex+=('0'+(((n>>>(k*8))&0xff)).toString(16)).slice(-2);}}return hex;}
  return _md5(str);
}
