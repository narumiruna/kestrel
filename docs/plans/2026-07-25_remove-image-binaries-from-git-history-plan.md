# Remove Image Binaries from Git History Plan

狀態：In progress。所有可寫入 heads／tags 與本機歷史已重寫並驗證；GitHub read-only pull-request refs／cache purge 與全 refs 的伺服器端 push rule 仍待外部處理。

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

- [x] 宣布短期 push freeze，取得 history rewrite、所有保留 branch／tag force-push、必要 branch 刪除、GitHub ruleset 變更與最終 purge 的逐項明確同意；2026-07-25 由 active goal 明確要求完整執行本計畫。
- [x] 以 `git ls-remote --heads --tags origin`、`git for-each-ref`、`git reflog --all`、`gh pr list` 與 `gh release list` 建立 `/tmp/kestrel-image-history-rewrite/` manifest；已記錄 31 個 local branch、9 個 remote heads、15 個 tag、4 個 open PR、232 個 pull-request refs 與 15 個 Releases。
- [x] 以副檔名與 blob magic 兩種方式掃描所有 refs／reflogs；`image-audit-before.json` 重現 40 個路徑、44 個 blobs、34 PNG／10 WebP，沒有額外圖片格式。
- [x] 盤點 232 個 GitHub hidden PR refs、0 forks、15 Releases 與 ruleset 能力；已選擇 GitHub Support purge 以避免刪除 repository 後遺失 224 個 PR、6 stars、Actions secrets 與 Release provenance。Support 網站需要 GitHub 瀏覽器登入，CLI token 無公開 Support API。

### 2. 在隔離 mirror 重寫所有歷史

- [x] 在 `/tmp/kestrel-image-history-rewrite/mirror-clean.git` 建立權限受限的新鮮 mirror，fetch 所有 remote／local refs，並以 `uv tool run git-filter-repo` 版本 `a40bce548d2c` 執行，未新增專案 dependency。
- [x] 將 40-path manifest 交給 `git-filter-repo --invert-paths --paths-from-file`，重寫 9 個 remote heads、31 個 local heads、15 個 tags 與 232 個本機鏡像 pull refs，包含 10 個 WebP、已刪除 PNG 與重複初始根。
- [x] 刪除 backup refs，執行 reflog expire 與 aggressive immediate GC；mirror `git fsck --full --no-reflogs --unreachable` 無輸出，掃描 1,907 個 blobs 得到 0 個圖片，44 個舊 OID 全部不存在。
- [x] 產生 882-entry commit map 與 288-entry ref map；逐一保留 31 個 local heads、9 個 remote heads、15 個 tags，並確認重寫後 `main` 只有預期的圖片與 screenshot infrastructure 清理。

### 3. 在乾淨歷史上移除產圖流程

- [x] 從重寫後的 `main` 移除 Android screenshot plugin／version／dependencies、`app/src/screenshotTest/`、`just android-ui`／`android-ui-update` 與 CI screenshot 步驟；`rg` 只剩本計畫與退役設計文件的文字說明。
- [x] 移除 `web/tests/ui/` snapshots，更新 `README.md` 與 `docs/design/ui-regression-testing.md`；`git ls-files web/tests/ui app/src/screenshotTestDebug/reference` 無輸出，Chrome 驗證沒有產生 repository 圖片。
- [x] 更新 `.gitignore`，移除 Android PNG 例外並以大小寫不敏感 pattern 忽略常見與延伸圖片格式；SVG／XML 與地圖 tile URL 保持可追蹤。

### 4. 建立可執行的防再犯機制

- [x] 新增 `scripts/check-no-image-binaries.sh`，提供 staged、tracked、range、all-history 與 pre-push 模式；同時檢查副檔名與 MIME、忽略 deletion、允許 SVG，並列出來源、path、blob 與原因。
- [x] 新增 `scripts/test-check-no-image-binaries.sh`；已證明文字與 SVG 通過、文字 `.png`／無副檔名 PNG 失敗、add-then-delete range 失敗、單純 deletion 通過。
- [x] 在 `.pre-commit-config.yaml` 加入 staged 與 pre-push hooks，`just hooks` 同時安裝兩者；隔離 bare remote 整合測試證明純文字 push 通過、add-then-delete 圖片 history 被 pre-push 拒絕。
- [x] 在 CI 加入總是執行的 `image-policy` job，掃描 tracked tree 與 PR／push range；rewritten `main` run `30140653927` 與 smoke PR #229 均通過，並已設為 `main` required status check。
- [x] 建立 active rulesets `Protect main image policy`（ID `19719005`）與 `Protect release tags`（ID `19719008`）；直接 main push 與 tag force-update均被 GitHub 拒絕，文字 smoke PR #229 的 required `image-policy` 通過後保持 mergeable 並已關閉。GitHub 拒絕建立 push ruleset，回覆 public personal repository 不支援。
- [ ] 若 GitHub 不支援適用於所有 refs 的 push 規則，將「遠端 topic branch 絕不短暫接收圖片」列為未滿足，改用支援自訂 pre-receive／push ruleset 的託管方式；不得只以 CI 失敗宣稱已完全避免圖片進入遠端歷史。

### 5. 驗證重寫後程式碼

- [x] 在重寫後 worktree 執行 path、tracked MIME 與 policy 掃描；追蹤圖片路徑為 0、圖片 blobs 為 0、沒有 `.gitattributes`／Git LFS 圖片 pointer。
- [x] 使用 Temurin 26.0.1 與 Android SDK 37.0 執行 `just android-check`、`just android-lint`、`just android-test`、`just android-build`，全部通過。
- [x] 在乾淨 worktree 執行 `npm ci`、`just web-check`、Web typecheck／build，全部通過；Chrome DevTools 驗證 login 與 Library 正常且無水平 overflow，未建立截圖。Map 的 WebGL 僅受既有 WSL Chrome `BindToCurrentSequence` 限制。
- [x] `git diff --check`、policy tests、Prek config／hooks 均通過；rewrite 前的實作 commits 只含文字檔與 screenshot test 原始碼 deletion，未 stage 或 commit 圖片。

### 6. 遠端 cutover 與最終清除

- [x] Cutover 前 `origin` 與 manifest 完全相符；以 24 個逐 ref lease 的 atomic force-push 更新 9 heads 與 15 tags，之後逐一確認遠端 tag objects 與 sanitized mirror 相符。
- [x] Force-update 4 個 Dependabot heads 到新歷史；PR #223–#226 均為 `CLEAN`，最新 CI 與 `image-policy` 全部成功。
- [x] 從全新 remote mirror 掃描 9 heads／15 tags，canonical refs 的 policy 全數通過；本機與 sanitized mirror 的 40 paths／44 OIDs 不可達且 magic 掃描為 0。Main CI 五個 jobs 全綠，15 tags、15 Releases 與 15 APK assets 仍存在。
- [ ] 對 GitHub hidden refs／cache 執行已選定的 Support purge 或 repository 重建流程，並以舊 commit/blob SHA 無法透過 GitHub 取得及 Support／重建紀錄作為證據；未取得此證據前不得宣稱 GitHub 端「完全清除」。
- [ ] 取得使用者對新歷史與功能驗證的最終接受後，刪除暫存 mirror，讓原 clone 的所有舊 refs／reflogs 到期並立即 prune，或直接刪除舊 clone 後重新 clone；再次執行 `git fsck --full --no-reflogs --unreachable` 與圖片 magic 掃描。
- [x] Repository 只有 `narumiruna` 一位 collaborator 且 forks 為 0；目前本機 clone 已重寫並 prune。純文字 smoke PR #229 證明 required CI／ruleset 生效後已關閉並刪除 branch。

## Completion Checklist（完成檢核）

- [x] `HEAD`、31 個 local branches、9 個 remote heads、15 個 tags、本機 reflog 與隔離 mirror 中 232 個重寫後 pull refs 都不含圖片二進位 blob；GitHub read-only pull refs 另列於未完成 Support purge。
- [ ] 40 個已知歷史路徑與 44 個已知 blob OID 均無法由 canonical repository 的任何 ref 取得，且完整 magic 掃描沒有新發現。
- [x] Android／Web 的 committed screenshot baselines 與會重新產生它們的 repository workflow 已退役，Android／Web quality gates 與 main CI 均通過。
- [ ] `.gitignore`、pre-commit、pre-push、CI required check 與 GitHub ruleset 均已通過正反案例驗證。
- [x] `main` 與 15 個 release tags 已安全切換到新 SHA；4 個 open PR、15 Releases、CI 與唯一協作者的本機 clone 已完成重新基底或重寫。
- [ ] GitHub Support purge 或 repository 重建已完成，舊 SHA 不可從 GitHub 取得；若有不可控 fork／clone，已明確列為外部限制而非宣稱已清除。
- [ ] 暫存 mirror、舊 clone、backup refs 與 reflog 已清除，最終 fresh clone 的 `git fsck`、副檔名掃描、MIME/magic 掃描及相關 quality gates 全數通過。
- [ ] 使用者已檢閱 SHA 對照、驗證證據、外部限制與不可逆 rollback 終止點，並明確接受完成狀態。
