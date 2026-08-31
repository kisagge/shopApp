#!/bin/bash
# 디자인 캔버스 아트보드 빌드. 워킹 파일(스크래치패드 프래그먼트) -> *.dc.html
set -e
SP="${SP:?SP(스크래치패드 경로) 환경변수를 지정하세요}"
cd "$(dirname "$0")"

node "$SP/gentab.mjs"       "$SP"
node "$SP/gendesk.mjs"      "$SP"
node "$SP/genadmin.mjs"     "$SP"
node "$SP/gencards.mjs"     "$SP/_dcards.html"
node "$SP/genprodrows.mjs"  "$SP/_prows.html"

W="node $SP/wrap.mjs"

# 모바일
cat $SP/home_body.html   $SP/_tab_home.html     > $SP/home.html && echo '</div>' >> $SP/home.html
cat $SP/list_body.html   $SP/_tab_category.html > $SP/list.html && echo '</div>' >> $SP/list.html
cat $SP/my_body.html     $SP/_tab_my.html       > $SP/my.html   && echo '</div>' >> $SP/my.html
$W $SP/home.html     HomeMobile.dc.html
$W $SP/list.html     ProductList.dc.html
$W $SP/my.html       MyPage.dc.html
$W $SP/cart.html     Cart.dc.html
$W $SP/checkout.html Checkout.dc.html
$W $SP/done.html     OrderComplete.dc.html
$W $SP/pdp.html      ProductDetail.dc.html $SP/pdp.js $SP/pdp.props.json

# 데스크톱
cat $SP/dhome_open.html $SP/_dhead_none.html  $SP/dhome_body.html                        $SP/_dfoot.html > $SP/dhome.html && echo '</div>' >> $SP/dhome.html
cat $SP/dlist_open.html $SP/_dhead_outer.html $SP/dlist_head.html $SP/_dcards.html $SP/dlist_tail.html $SP/_dfoot.html > $SP/dlist.html && echo '</div>' >> $SP/dlist.html
cat $SP/dpdp_open.html  $SP/_dhead_outer.html $SP/dpdp_body.html                         $SP/_dfoot.html > $SP/dpdp.html  && echo '</div>' >> $SP/dpdp.html
$W $SP/dhome.html     HomeDesktop.dc.html
$W $SP/dlist.html     ProductListDesktop.dc.html
$W $SP/dpdp.html      ProductDetailDesktop.dc.html
$W $SP/dcheckout.html CheckoutDesktop.dc.html

# 어드민
cat $SP/adash_open.html $SP/_asidebar_dash.html     $SP/adash_head.html $SP/_achart.html $SP/adash_tail.html > $SP/adash.html
cat $SP/aprod_open.html $SP/_asidebar_products.html $SP/aprod_head.html $SP/_prows.html  $SP/aprod_tail.html > $SP/aprod.html
cat $SP/aord_open.html  $SP/_asidebar_orders.html   $SP/aord_body.html                                       > $SP/aord.html
$W $SP/adash.html AdminDashboard.dc.html
$W $SP/aprod.html AdminProducts.dc.html
$W $SP/aord.html  AdminOrderDetail.dc.html

echo "빌드 완료: $(ls -1 *.dc.html | wc -l | tr -d ' ')개 아트보드"
