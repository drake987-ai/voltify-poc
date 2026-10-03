# Voltify PoC Sandbox

Web demo tương tác của **Voltify**: nền tảng SaaS dùng AI dự đoán rủi ro cháy nổ và tối ưu vòng đời pin cho xe máy điện thương mại (shipper, logistics chặng cuối, mạng lưới trạm đổi pin) tại Việt Nam.

> *English, in one line:* a frontend-only proof of concept (no backend, runs offline after the build) that simulates battery fleets with physics-based models, runs a real explainable AI engine on the simulated telemetry in the browser, and reports its accuracy honestly, including where it fails. Every screen is available in Vietnamese and English.

Toàn bộ mô phỏng và AI chạy **trong trình duyệt** (Web Worker), triển khai được như một site tĩnh, không cần máy chủ.

## Nguyên tắc uy tín

Dự án này chủ ý nói rõ cả những gì nó **chưa** chứng minh được.

1. **Dữ liệu được gắn nhãn trên mỗi màn hình**: `Dữ liệu mô phỏng (Simulated)`, `Dữ liệu thật (Real): ...` hoặc `Nội dung tham khảo (Reference)`.
2. **Mô phỏng có cơ sở vật lý**, không phải random thuần túy (mạch tương đương ECM 1-RC, mô hình nhiệt tập trung, lão hóa Arrhenius, đoản mạch ngầm). Mọi tham số là *giả định* và nằm ở `src/sim/params.ts`.
3. **AI giải thích được**: mỗi cảnh báo cho biết tín hiệu nào kích hoạt, giá trị so với ngưỡng và độ tin cậy.
4. **Số đo tính ra từ mô phỏng**, không gõ tay (Precision, Recall, tỷ lệ báo động giả, lead time, ROC), kèm cả những ca AI bỏ sót hoặc báo sai.
5. **Mọi con số kinh doanh truy ngược được** về công thức và giả định (bấm vào con số).
6. **Không có tuyên bố tuyệt đối.** Các mục tiêu của brief (lead time 30 đến 45 phút, kéo dài tuổi thọ pin khoảng 35%, giảm điện năng khoảng 20%) được ghi là *mục tiêu cần xác nhận qua pilot*, đặt cạnh số đo thật của PoC. Một test (`tests/i18n.test.ts`) chặn các cụm như "99%" hay "tuyệt đối" trong giao diện.

## Chạy nhanh

Cần Node.js 22.12 trở lên (đã chạy trên Node 24 LTS) và npm. Chỉ build và chạy bản dựng sẵn thì Vite chấp nhận Node 20.19, nhưng bộ test (Vitest) cần 22.12.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | server phát triển (HMR) |
| `npm run build` | kiểm tra kiểu (`tsc -b`) rồi build ra `dist/` |
| `npm run preview` | phục vụ `dist/` tại http://127.0.0.1:4173 |
| `npm test` | chạy toàn bộ test (Vitest) |
| `npm run sim -- --n 8 --minutes 30 --scenario internalShort` | simulator chạy không giao diện, in telemetry (xem đầu `scripts/headless.ts` để biết các cờ, như `--ai --explain`, `--check-determinism`, `--bench`) |

Mở bằng `http://`, không mở trực tiếp `dist/index.html` bằng `file://` (Web Worker cần một server tĩnh).

## Các màn hình

Đường dẫn dùng hash (`#/fleet`, ...) nên không cần cấu hình rewrite trên host tĩnh.

| Màn | Đường dẫn | Nội dung |
|---|---|---|
| Story Mode | `#/story` | demo tự động 3 phút qua màn 1, 3, 5, 7 với chú thích; số trong chú thích lấy từ chính mô phỏng |
| Sandbox Mode | `#/sandbox` | tự đổi nhiệt độ, tải, độ chai, làm mát, cell yếu, tiêm đoản mạch ngầm và xem BMS truyền thống so với Voltify |
| 1. Tổng quan (Fleet) | `#/fleet` | bản đồ 300 hoặc 2.000 pin theo mức rủi ro, KPI truy ngược được, cảnh báo trực tiếp |
| 2. Digital Twin | `#/twin` | từng pin: điện áp từng cell, nhiệt, nội trở, đường thực tế so với AI dự đoán, giải thích Risk Score |
| 3. BMS vs Voltify | `#/bms-vs-voltify` | cùng kịch bản, cùng seed: BMS ngắt ở 65°C, Voltify cảnh báo sớm (lead time đo được) |
| 4. Bốn chỉ số sinh hiệu | `#/vitals` | SOC, SOH, an toàn và rủi ro cháy nổ, hiệu suất xả |
| 5. Cơ chế can thiệp | `#/intervention` | điện thoại shipper, nhật ký lệnh, tủ sạc hạ dòng sạc |
| 6. Cross-brand Hub | `#/cross-brand` | ba định dạng JSON thô, adapter, một màn hình thống nhất, ô thử gói tin của bạn |
| 7. ROI và Impact | `#/roi` | máy tính ROI hai trường hợp (Thận trọng và Mục tiêu), công thức và giả định chỉnh được |
| 8. Evidence | `#/evidence` | đánh giá hàng loạt trong trình duyệt, ma trận nhầm lẫn, ROC, lead time, ca sai, phép thử SOH trên dữ liệu NASA thật |
| 9. Thị trường và Kinh doanh | `#/market` | UVP, TAM/SAM/SOM (placeholder, chưa có nguồn), đối thủ, doanh thu, lộ trình, tài liệu tham khảo |

## Kiến trúc

```
[Simulator: pin/xe/thời tiết]  →  [Adapter chuẩn hóa đa hãng]  →  [AI Engine: 4 module]  →  [Decision/Intervention]  →  [UI]
   tick 5 giây mô phỏng           (3 định dạng → 1 schema)        thermal, voltage, overload,   hạ công suất, báo shipper,
   (src/sim)                       (src/adapters)                  impedance/SOH + Risk Score    đổi pin, hạ dòng sạc
                                                                   (src/ai)                      (src/intervention)
```

- **Ground truth tách khỏi telemetry.** AI chỉ thấy `Telemetry` đã chuẩn hóa; trạng thái ẩn của simulator (SOH thật, nhiệt sinh do đoản mạch, ...) chỉ được `src/eval` dùng để chấm điểm. Một test (`tests/ai/isolation.test.ts`) chặn `src/ai` import từ `src/sim`, trừ `nominal.ts` (hằng số cỡ datasheet).
- **Tất định.** Mỗi pin có nguồn ngẫu nhiên riêng theo seed; cùng seed cho đúng cùng kết quả, và hai lần chạy có và không có lỗi giống hệt nhau cho tới khi lỗi bắt đầu.
- **Web Worker.** Mô phỏng và AI chạy ở `src/workers/` (đội pin sống, so sánh A/B, đánh giá hàng loạt) nên giao diện luôn mượt; có phương án chạy trên luồng chính nếu không có Worker.

### Cấu trúc thư mục

```
src/
  sim/          ECM, nhiệt, lão hóa, kịch bản, định dạng ba hãng
  adapters/     chuẩn hóa ba định dạng về Telemetry, bảng ánh xạ trường
  ai/           thermalTrend, voltageAnomaly, overload, impedanceSOH, riskScore, giải thích
  intervention/ chính sách can thiệp xe, trạm đổi pin, tủ sạc
  eval/         chạy A/B, đánh giá hàng loạt, Cross-brand, phép thử SOH trên dữ liệu thật
  fleet/        đội pin sống (hai đội song song để đếm sự cố ngăn chặn)
  business/     giả định và mô hình ROI
  story/        đồng hồ và chú thích của Story Mode
  data/         dữ liệu NASA PCoE đã trích gọn
  pages/        các màn hình
  components/   biểu đồ, bản đồ, bố cục, thành phần dùng chung
  i18n/         vi.json, en.json
  workers/      Web Worker và client
tests/          Vitest (hàm thuần, có seed)
scripts/        headless.ts, extractNasaPcoe.mjs
```

## Kiểm chứng

`npm test` chạy toàn bộ test, gồm cả đánh giá hàng loạt của màn Evidence (78 nhóm mô phỏng) với các khẳng định về hành vi, không chỉ về cú pháp: vật lý (nhiệt cân bằng năng lượng, tỷ số Arrhenius), tính tất định, AI không bị báo giả ở đội pin khỏe, lead time đo được, adapter trả về lỗi có kiểu thay vì ném lỗi, hai ngôn ngữ trùng khóa.

Kết quả của màn Evidence ở bản này (dữ liệu mô phỏng, các seed 301 đến 306 chưa dùng để chỉnh ngưỡng; xem chính màn hình để có số cập nhật và khoảng tin cậy):

| Chỉ số | Giá trị |
|---|---|
| Recall (phát hiện sự cố) | 102/111 = 91,9% |
| Precision | 102/155 = 65,8% (phụ thuộc tỷ lệ sự cố trong mẫu) |
| Báo động giả | 53/1202 = 4,4% (44 trong số đó là đội pin có cell yếu) |
| Lead time (trước khi BMS ngắt ở 65°C) | 12,7 đến 25,7 phút, trung bình 19,3 phút. **Mục tiêu 30 đến 45 phút chưa đạt** |
| Ca bỏ sót | 9, đều là đoản mạch rất nhẹ (khoảng 9 W) |

### Dữ liệu thật: NASA PCoE

Màn Evidence có một phép thử trên **dữ liệu pin thật** của NASA (bốn cell 18650 lão hóa B0005, B0006, B0007, B0018). Kết quả cố ý không đẹp: quy luật điện trở sang SOH mà mô phỏng giả định (γ = 4) **không đúng** trên các cell thật (điện trở tăng ít hơn nhiều), nên SOH ước lượng lệch khoảng 9 đến 23 điểm %. Màn hình nêu hệ quả (phải hiệu chỉnh theo từng loại pin bằng dữ liệu pilot) và phạm vi của phép thử.

Dữ liệu thô không nằm trong repo (khoảng 56 MB). Phần được dùng (dung lượng từng chu kỳ và các lần đo trở kháng, khoảng 33 KB) nằm ở `src/data/nasaPcoe.json`. Để tạo lại: tải "5. Battery Data Set.zip" từ [NASA Prognostics Data Repository](https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/), giải nén `1. BatteryAgingARC-FY08Q4.zip`, rồi chạy `scripts/extractNasaPcoe.mjs` (hướng dẫn ở đầu file; script dùng `mat-for-js`, giấy phép GPL-3.0, nên cài ở thư mục nháp chứ không thêm vào dự án).

Ghi công theo yêu cầu của NASA: *B. Saha and K. Goebel (2007). Battery Data Set, NASA Prognostics Data Repository, NASA Ames Research Center, Moffett Field, CA.*

## Triển khai (deploy)

`npm run build` tạo thư mục `dist/` gồm toàn file tĩnh. Vì `base` là `./` và đường dẫn dùng hash, có thể đặt ở bất kỳ thư mục con nào mà không cần cấu hình rewrite.

- **Vercel**: Framework Preset `Vite`, Build Command `npm run build`, Output Directory `dist`.
- **Netlify**: Build command `npm run build`, Publish directory `dist`.
- **GitHub Pages**: đẩy nội dung `dist/` lên nhánh `gh-pages` (hoặc dùng GitHub Actions upload artifact `dist`). Trang chạy được dưới `https://<user>.github.io/<repo>/`.

### Chạy offline

Mọi thứ cần để chạy đều nằm trong bản build: font (Inter) được đóng gói, không gọi CDN, không gọi API ngoài. **Ngoại lệ duy nhất là nền bản đồ** ở màn Tổng quan: gạch bản đồ lấy từ OpenStreetMap. Khi không có mạng, bản đồ tự chuyển sang lưới đơn giản (các chấm pin và mọi chức năng khác vẫn chạy) và hiện một dòng thông báo.

- Chính sách của OpenStreetMap không dành cho lưu lượng lớn; khi triển khai thật hãy dùng máy chủ gạch bản đồ riêng bằng cách đặt biến `VITE_TILE_URL` (ví dụ `https://tiles.example.com/{z}/{x}/{y}.png`) lúc build.
- Để tập dượt chế độ offline với đúng bản build: `VITE_TILE_URL=http://127.0.0.1:9/{z}/{x}/{y}.png npx vite build --outDir dist-offline`, rồi `npx vite preview --outDir dist-offline`.

## Hai ngôn ngữ

Tiếng Việt là ngôn ngữ chính, giữ tiếng Anh cho thuật ngữ chuyên ngành (Digital Twin, BMS, SOH, SOC, Lead time, ...). Nút VI/EN ở thanh đầu trang. Mọi chuỗi chữ nằm ở `src/i18n/vi.json` và `src/i18n/en.json`; khóa được kiểm tra kiểu lúc build, và một test bắt buộc hai file có cùng tập khóa. Thêm chuỗi mới: thêm khóa vào **cả hai** file.

## Giới hạn đã biết và lộ trình

- **Dữ liệu là mô phỏng** (trừ phép thử SOH trên dữ liệu NASA). AI được chỉnh trên cùng loại vật lý mà nó được đánh giá, nên khoảng cách giữa mô phỏng và thực tế là điều chưa biết lớn nhất. Chỉ pilot với telemetry thật mới trả lời được.
- **Sự cố trong đánh giá là đoản mạch ngầm hoặc BMS ngắt ở 65°C**, không phải cháy thật; mô phỏng không tái hiện thermal runaway.
- **Lead time đo được thấp hơn mục tiêu** 30 đến 45 phút; dự báo thời gian còn lại tới 65°C thường lạc quan hơn thực tế.
- **Hạ công suất 15% chỉ làm nhiệt tăng chậm lại** khi nhiệt do tải; với đoản mạch ngầm, giá trị là cảnh báo sớm và cô lập (đổi pin).
- **Cell yếu và cell rò** cho tín hiệu điện áp giống nhau nên một phần đội cell yếu bị cảnh báo (báo giả về cháy nổ, nhưng đúng về bảo trì).
- **SOH từ điện trở** không đúng trên các cell thật của NASA (xem trên); mô-đun cần hiệu chỉnh theo từng loại pin.
- **Ba hãng là hãng giả định** ("-like"); định dạng viết theo mô tả giả định, không phải đặc tả của hãng nào.
- **TAM/SAM/SOM, nhiều ô của bảng đối thủ, giá điện, phí SaaS, tần suất sự cố** là placeholder hoặc giả định minh họa, không có nguồn xác thực; để `[điền số liệu + nguồn]` hoặc ghi rõ là minh họa.

Lộ trình: giai đoạn 1 (pilot) chỉ **giám sát và cảnh báo** trên telemetry thật để đo lead time, precision, recall thật; giai đoạn 2 mới **can thiệp điều khiển ngược** về xe và tủ sạc, sau khi có thỏa thuận với hãng xe; mở rộng đa hãng và Đông Nam Á sau đó.

## Xử lý sự cố

- **Windows không phân biệt hoa thường trong tên file**: đừng đặt hai file chỉ khác nhau hoa thường trong cùng thư mục (ví dụ `tryIt.ts` và `TryIt.tsx`), TypeScript sẽ báo lỗi.
- **Trang trắng khi mở bằng `file://`**: dùng `npm run preview` hoặc một server tĩnh bất kỳ.
- **Bản đồ trống, chỉ có lưới**: không tải được gạch bản đồ OpenStreetMap (offline hoặc bị chặn); đây là chế độ dự phòng, không phải lỗi.
- **Cổng 5173 hoặc 4173 đang bận**: cấu hình dùng `strictPort`, hãy đóng tiến trình đang chiếm cổng.

## Giấy phép và ghi công các thành phần

React, Vite, Vitest, Zustand, i18next (MIT); ECharts (Apache-2.0); Leaflet (BSD-2-Clause); lucide-react (ISC); Tailwind CSS (MIT); font Inter qua `@fontsource-variable/inter` (SIL OFL 1.1); dữ liệu bản đồ © những người đóng góp OpenStreetMap (ODbL); dữ liệu pin NASA PCoE (xem trên). Tài liệu tham khảo của brief được liệt kê, cùng điều cố ý không lấy từ mỗi nguồn, ở màn Evidence và màn Thị trường.
