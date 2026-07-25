# Remove Image Binaries from Git History Plan

狀態：Draft。此計畫只定義執行與驗證方式，不授權 history rewrite、force-push、刪除 refs、變更 GitHub 規則或清除本機物件。

## Goal（目標）

從 Kestrel 目前工作樹、`main`、所有保留的 branch／tag 與 GitHub canonical repository 可達歷史中，移除所有圖片二進位 blob，包含 PNG、JPG／JPEG、GIF、WebP、AVIF、HEIF／HEIC、BMP、TIFF、ICO 與其他由檔案 magic 判定的圖片二進位格式；完成後以本機 hook、pre-push 檢查、CI 與 GitHub ruleset 阻止圖片再次進入受保護的 Git 歷史。

文字型 SVG／XML、程式碼中的 `.png` URL，以及放在儲存庫外的驗證截圖不在清除範圍。

## Context

- 目前檢查到 40 個歷史圖片路徑、44 個不同圖片 blob：34 個 PNG blob 與 10 個 WebP blob，沒有副檔名與 magic 不一致的項目。
- `HEAD` 仍追蹤 29 個 PNG：約 7 個 Android Compose screenshot references 與 22 個 Web UI snapshots；另有 10 個 launcher WebP 與 1 個 Web snapshot 已刪除但仍留在歷史。
- `main` 有 6 個 commit 直接新增、修改或刪除圖片；其他 remote branch／reflog 還有兩個包含相同 launcher WebP 的初始歷史根。
- 遠端目前有 `main`、8 個其他 branch、15 個 tag、4 個 open PR 與 232 個 GitHub pull-request refs；本機另有 31 個 branch。所有保留且可寫入的 refs 都必須重寫，否則舊 blob 仍可達。
- `main` 目前沒有 branch protection，GitHub repository ruleset 清單為空。
- `.gitignore` 目前只忽略 `*.png`，並明確允許 Android screenshot references；無法阻止 WebP、其他副檔名、`git add -f` 或無圖片副檔名的 binary。
- Android screenshot plugin、`app/src/screenshotTest/`、`just android-ui*` 與 CI 的 `validateDebugScreenshotTest` 依賴 committed PNG baselines；若清除基準圖，這套流程必須一併退役或改成不提交圖片的驗證方式。
- `git-filter-repo` 尚未安裝；`git`、`file` 與 `prek` 已存在。

## Assumptions

- 「Git 歷史」指本機 canonical repository 與 `origin` 所有可控制 refs；不把第三方 fork、他人 clone、備份服務或已下載的 release artifacts 當成可由本計畫單方面清除的範圍。
- GitHub 的 hidden pull-request refs、cache 與尚未 garbage-collect 的 unreachable objects 無法只靠 force-push 證明已實體刪除。若要求 GitHub 端不可再以舊 SHA 取得物件，完成條件必須包含 GitHub Support 確認，或刪除並重建 repository。
- 清除後不再保留 committed screenshot baselines；Android 與 Web 的畫面驗證改用儲存庫外的暫存截圖、Chrome DevTools，以及不產生圖片檔的結構／語意測試。
- History rewrite 會改變所有受影響 commit 與 tag SHA；現有 PR、舊 clone、release provenance 與 commit 連結都需要重新對應。

## Risks

- Force-push 錯誤 refs 可能遺失尚未整合的 branch、tag 或 commit。
- 重寫 15 個 release tags 會改變 tag SHA；若有簽署 tag，簽章會失效。GitHub Releases、下載頁與自動化必須逐一複驗。
- 只從 `main` 刪檔不會清除歷史；只重寫 `main` 也會因其他 branch、tag、reflog 或 hidden refs 而留下 blob。
- 只靠 `.gitignore` 或 pre-commit hook 可被 `git add -f`／`--no-verify` 繞過；只靠 CI 則可能在檢查前就讓 binary 進入遠端 topic branch。
- 移除 screenshot regression infrastructure 會降低像素差異覆蓋；必須保留非圖片測試與明確的儲存庫外視覺驗證流程。
- GitHub 個人 repository 若不支援 push ruleset 的副檔名限制，就無法提供自訂 pre-receive MIME 檢查；此限制必須在 cutover 前解決或由使用者明確接受。

## Rollback / Recovery

- 在任何遠端寫入前，凍結 push，記錄所有 local／remote refs、tag、open PR、GitHub Release 與舊 SHA，並將原 clone 保持唯讀作為暫時 rollback 來源；不要再複製圖片到一般備份或雲端同步目錄。
- 在隔離的暫存 mirror 完成 rewrite、建置與物件稽核前，不改動 `origin`。
- Cutover 使用逐一 ref 的 `--force-with-lease=<ref>:<舊 SHA>`，不要直接使用無邊界的 `git push --mirror`。任何 lease 不符立即停止並重新盤點。
- Force-push 後若功能驗證失敗，在尚未清除原 clone 前，可經再次明確同意後用記錄的舊 SHA 回復；一旦使用者接受新歷史並開始最終 purge，rollback window 即結束。
- 新歷史驗收後，刪除所有暫存 mirror、filter-repo backup refs 與舊 clone 的 refs／reflogs，執行立即 prune；協作者必須刪除舊 clone 後重新 clone，不得把舊 branch merge 回新歷史。

## Plan（計畫）

### 1. 凍結與完整盤點

- [ ] 宣布短期 push freeze，取得 history rewrite、所有保留 branch／tag force-push、必要 branch 刪除、GitHub ruleset 變更與最終 purge 的逐項明確同意；以執行紀錄中的核准文字作為證據。
- [ ] 以 `git ls-remote --heads --tags origin`、`git for-each-ref`、`git reflog --all`、`gh pr list` 與 `gh release list` 建立不可變 ref manifest，記錄每個 ref 的舊 SHA、保留／刪除決策與 open PR 對應；確認 manifest 涵蓋目前 31 個 local branch、9 個 remote heads、15 個 tag、4 個 open PR 與 232 個 pull-request refs。
- [ ] 以副檔名與 blob magic 兩種方式掃描所有 refs／reflogs，產生放在儲存庫外的精確 path/blob manifest；重現目前 40 個路徑、44 個 blobs、34 PNG／10 WebP，任何額外結果都先加入範圍再繼續。
- [ ] 盤點 GitHub hidden PR refs、fork、Release/tag 綁定與 repository ruleset 能力；若 GitHub 無法封鎖圖片副檔名 push 或無法 purge 舊 SHA，先決定移至支援 push ruleset 的組織／主機、請 GitHub Support 協助，或刪除重建 repository，未決不得進入 cutover。

### 2. 在隔離 mirror 重寫所有歷史

- [ ] 在儲存庫外建立權限受限的新鮮 `git clone --mirror`，重新 fetch 所有已核准 heads／tags，並以 `uv tool run git-filter-repo --version`（或等價的隔離安裝）固定工具版本；不得把工具加入專案 dependency。
- [ ] 將 path/blob manifest 轉成 `git-filter-repo` 的精確刪除輸入，對所有保留 refs 執行 invert-path rewrite；不得只用 `*.png` glob，必須同時移除 10 個歷史 WebP、已刪除 PNG、重複初始根與稽核找到的任何無副檔名圖片 binary。
- [ ] 刪除 filter 工具留下的 backup refs，執行 `git reflog expire --expire=now --all` 與 `git gc --prune=now`；以 `git show-ref`、`git fsck --full`、全物件 MIME/magic 掃描證明隔離 mirror 中沒有任何可達或 unreachable 圖片 blob。
- [ ] 產生舊 SHA → 新 SHA、branch 與 tag 對照表；逐一確認所有核准保留 refs 仍存在、所有核准刪除 refs 已消失，且非圖片檔的最新 tree 除預期清理外沒有內容差異。

### 3. 在乾淨歷史上移除產圖流程

- [ ] 從重寫後的 `main` 移除 Android screenshot plugin／version／dependencies、`app/src/screenshotTest/`、`just android-ui`／`android-ui-update` 與 CI `validateDebugScreenshotTest`／報告上傳步驟；以 `rg 'screenshotTest|validateDebugScreenshotTest|updateDebugScreenshotTest'` 只剩歷史文件中的明確退役說明為證據。
- [ ] 移除已無測試原始碼支撐的 `web/tests/ui/` snapshot 目錄，更新 `README.md` 與 `docs/design/ui-regression-testing.md`，把視覺證據改為 Chrome DevTools／暫存目錄且不得提交；以 `git ls-files web/tests/ui app/src/screenshotTestDebug/reference` 無輸出為證據。
- [ ] 更新 `.gitignore`：刪除 Android PNG 例外，加入大小寫不敏感寫法的 PNG、JPG／JPEG、GIF、WebP、AVIF、HEIF／HEIC、BMP、TIFF、ICO 等圖片二進位副檔名；保留文字型 SVG／XML 與原始碼中的地圖 tile URL。

### 4. 建立可執行的防再犯機制

- [ ] 新增文字腳本 `scripts/check-no-image-binaries.sh`，提供 staged、tracked-tree 與 commit-range 三種模式：同時檢查禁止副檔名與 staged／Git blob magic，忽略 deletion、允許文字 SVG，並在失敗時列出 ref、commit、path、偵測格式與修復動作。
- [ ] 新增隔離暫存 Git repository 的腳本測試，至少證明：一般文字檔與 SVG 通過；文字內容的 `.png` 路徑失敗；無副檔名 PNG magic 失敗；add-then-delete 的 commit range 失敗；單純刪除歷史圖片不會被誤擋。
- [ ] 在 `.pre-commit-config.yaml` 加入 pre-commit staged 檢查與 pre-push range 檢查，透過 `prek install --hook-type pre-commit --hook-type pre-push` 安裝；以測試 push 到本機 bare remote 時圖片 commit 被拒絕、純文字 commit 可 push 為證據。
- [ ] 在 `.github/workflows/ci.yml` 加入總是執行的圖片政策 job，使用完整所需 fetch depth 掃描 PR range、push range 與結果 tree；將它設為 `main` 的 required status check，確保圖片不能 merge 到 canonical history。
- [ ] 建立 GitHub branch/tag ruleset：禁止直接更新 `main`、要求 PR 與圖片政策檢查、限制 force-push；若方案支援 push ruleset，再封鎖所有列出的圖片副檔名於所有 refs。以 `gh api repos/narumiruna/kestrel/rulesets` 的回讀結果與一個被伺服器拒絕的測試 push 作為證據。
- [ ] 若 GitHub 不支援適用於所有 refs 的 push 規則，將「遠端 topic branch 絕不短暫接收圖片」列為未滿足，改用支援自訂 pre-receive／push ruleset 的託管方式；不得只以 CI 失敗宣稱已完全避免圖片進入遠端歷史。

### 5. 驗證重寫後程式碼

- [ ] 在重寫後的普通 worktree 執行 `git ls-files` 副檔名掃描、全 tracked blob magic 掃描與 `scripts/check-no-image-binaries.sh --tracked`，證明目前 tree 沒有圖片二進位檔或 Git LFS 圖片 pointer。
- [ ] 使用 Java 26 執行 `just android-check`、`just android-lint`、`just android-test` 與 `just android-build`；確認移除 screenshot plugin 後 Android 仍可格式化、分析、測試與建置。
- [ ] 先在 `web/` 執行 `npm ci`，再執行 `just web-check`、`npm run typecheck` 與 `npm run build`；用 Chrome DevTools 驗證主要 Web 畫面，所有截圖只存儲存庫外。
- [ ] 執行 `git diff --check`、防圖片腳本測試與完整相關 hooks，確認準備推送的 commit 只含文字／允許的非圖片檔，且沒有 staged 圖片 deletion 以外的 binary 變更。

### 6. 遠端 cutover 與最終清除

- [ ] 再次確認 push freeze 仍有效且 `origin` ref SHA 與 manifest 相符；逐一用 force-with-lease 更新核准的 branch／tag，逐一刪除核准淘汰的 refs，任何差異立即停止。
- [ ] 重新建立或 rebase 4 個 open PR 到新歷史，確認 Dependabot 與其他自動化不會從舊基底帶回圖片 blob；關閉無法安全重建的舊 PR branch。
- [ ] 從全新 clone 掃描所有 GitHub 可見 heads／tags 與完整物件，確認 40 個舊路徑、44 個舊 blob OID、禁止副檔名與圖片 magic 都無法由任何 canonical ref 抵達；再驗證 CI、tags、GitHub Releases 與下載流程。
- [ ] 對 GitHub hidden refs／cache 執行已選定的 Support purge 或 repository 重建流程，並以舊 commit/blob SHA 無法透過 GitHub 取得及 Support／重建紀錄作為證據；未取得此證據前不得宣稱 GitHub 端「完全清除」。
- [ ] 取得使用者對新歷史與功能驗證的最終接受後，刪除暫存 mirror，讓原 clone 的所有舊 refs／reflogs 到期並立即 prune，或直接刪除舊 clone 後重新 clone；再次執行 `git fsck --full --no-reflogs --unreachable` 與圖片 magic 掃描。
- [ ] 通知所有協作者刪除舊 clone／fork 後重新 clone，禁止 merge 舊 branch；在 freeze 解除前以一個純文字測試 PR 證明 hooks、CI 與 ruleset 都生效。

## Completion Checklist（完成檢核）

- [ ] `HEAD`、所有保留 local／remote branch、所有 tag、reflog 與可控 hidden refs 都不再含任何圖片二進位 blob。
- [ ] 40 個已知歷史路徑與 44 個已知 blob OID 均無法由 canonical repository 的任何 ref 取得，且完整 magic 掃描沒有新發現。
- [ ] Android／Web 的 committed screenshot baselines 與會重新產生它們的 repository workflow 已退役，相關建置與測試仍通過。
- [ ] `.gitignore`、pre-commit、pre-push、CI required check 與 GitHub ruleset 均已通過正反案例驗證。
- [ ] `main` 與 release tags 已安全切換到新 SHA；PR、Release、自動化與協作者 clone 已完成重新基底或重建。
- [ ] GitHub Support purge 或 repository 重建已完成，舊 SHA 不可從 GitHub 取得；若有不可控 fork／clone，已明確列為外部限制而非宣稱已清除。
- [ ] 暫存 mirror、舊 clone、backup refs 與 reflog 已清除，最終 fresh clone 的 `git fsck`、副檔名掃描、MIME/magic 掃描及相關 quality gates 全數通過。
- [ ] 使用者已檢閱 SHA 對照、驗證證據、外部限制與不可逆 rollback 終止點，並明確接受完成狀態。
