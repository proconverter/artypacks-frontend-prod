document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const VITE_CONVERT_API_ENDPOINT = "https://artypacks-backend-prod.onrender.com/convert";
    const VITE_CHECK_API_ENDPOINT = "https://artypacks-backend-prod.onrender.com/check-license";
    const VITE_RECOVER_SESSION_ENDPOINT = "https://artypacks-backend-prod.onrender.com/recover-session";
    const VITE_DOWNLOAD_ALL_ENDPOINT = "https://artypacks-backend-prod.onrender.com/download-all";
    const ETSY_STORE_LINK = 'https://www.etsy.com/shop/artypacks';
    const MAX_MULTI_UPLOAD = 10;
    // --- NECESSARY ADDITION: MAX FILE SIZE IN BYTES (35MB ) ---
    const MAX_FILE_SIZE = 35 * 1024 * 1024;

    // --- DOM ELEMENT SELECTORS ---
    const licenseKeyInput = document.getElementById('license-key' );
    const licenseStatus = document.getElementById('license-status');
    const sessionRecoveryContainer = document.getElementById('session-recovery-link-container');
    const getLicenseLinkContainer = document.querySelector('.get-license-link');
    const convertButton = document.getElementById('convert-button');
    const activationNotice = document.getElementById('activation-notice');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const appTool = document.getElementById('app-tool');
    const dropZoneText = document.getElementById('drop-zone-text');
    const dropZoneLimits = document.getElementById('drop-zone-limits');
    const dropZoneError = document.getElementById('drop-zone-error');
    const fileUploadLabel = document.getElementById('file-upload-label');

    // Views
    const singleDownloadView = document.getElementById('single-download-view');
    const batchDownloadView = document.getElementById('batch-download-view');
    const downloadCenterView = document.getElementById('download-center-view');

    // Single Download View Elements
    const singleDownloadFilename = document.getElementById('single-download-filename');
    const singleDownloadBtn = document.getElementById('single-download-btn');
    const convertAnotherSingleBtn = document.getElementById('convert-another-single-btn');

    // Batch Download View Elements
    const batchDownloadList = document.getElementById('batch-download-list');
    const downloadAllBatchBtn = document.getElementById('download-all-batch-btn');
    const convertAnotherBatchBtn = document.getElementById('convert-another-batch-btn');

    // Download Center View Elements
    const downloadCenterList = document.getElementById('download-center-list');
    const backToConverterCenterBtn = document.getElementById('back-to-converter-center-btn');

    // --- STATE MANAGEMENT ---
    let uploadedFiles = [];
    let isLicenseValid = false;
    let validationController;
    let isConverting = false;
    let allConversionsComplete = false;
    let currentUserState = { type: 'none', credits: 0, initialCredits: 0 };

    // --- INITIALIZATION ---
    const initializeApp = () => {
        document.getElementById('current-year').textContent = new Date().getFullYear();
        setupEventListeners();
        checkLicenseAndToggleUI();
    };

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        licenseKeyInput.addEventListener('input', handleLicenseInput);
        dropZone.addEventListener('click', () => { if (!dropZone.classList.contains('disabled')) fileInput.click(); });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); if (!dropZone.classList.contains('disabled')) dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);
        convertButton.addEventListener('click', handleConversionOrNavigation);
        
        convertAnotherSingleBtn.addEventListener('click', partialReset);
        convertAnotherBatchBtn.addEventListener('click', partialReset);
        backToConverterCenterBtn.addEventListener('click', partialReset);

        downloadAllBatchBtn.addEventListener('click', handleDownloadAllBatch);

        document.querySelectorAll('.accordion-question, .footer-accordion-trigger').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                const item = e.currentTarget.closest('.accordion-item, .footer-accordion-item');
                if (item) item.classList.toggle('open');
            });
        });

        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
            const formStatus = document.getElementById('form-status');
            contactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(contactForm);
                try {
                    const response = await fetch(contactForm.action, { method: 'POST', body: formData, headers: { 'Accept': 'application/json' } });
                    if (response.ok) {
                        formStatus.style.display = 'flex';
                        contactForm.reset();
                        setTimeout(() => { formStatus.style.display = 'none'; }, 5000);
                    } else {
                        throw new Error('Form submission failed.');
                    }
                } catch (error) {
                    console.error('Contact form error:', error);
                    alert('Sorry, there was an issue sending your message. Please try again later.');
                }
            });
        }
    };

    // --- CORE FUNCTIONS ---
    const handleConversionOrNavigation = () => {
        if (allConversionsComplete) {
            const successfulFiles = uploadedFiles.filter(f => f.status === 'completed');
            if (currentUserState.type === 'single_credit' && successfulFiles.length > 0) {
                showSingleDownloadView(successfulFiles[0]);
            } else if (currentUserState.type === 'multi_credit' && successfulFiles.length > 0) {
                showBatchDownloadView(successfulFiles);
            } else {
                recoverSession(licenseKeyInput.value.trim());
            }
        } else {
            handleBatchConversion();
        }
    };

    const handleLicenseInput = () => {
        if (validationController) validationController.abort();
        isLicenseValid = false;
        currentUserState = { type: 'none', credits: 0, initialCredits: 0 };
        sessionRecoveryContainer.classList.add('hidden');
        sessionRecoveryContainer.innerHTML = '';
        checkLicenseAndToggleUI();
        const key = licenseKeyInput.value.trim();
        if (key.length > 5) {
            validateLicenseWithRetries(key);
        } else {
            licenseStatus.innerHTML = '';
            licenseStatus.className = 'license-status-message';
        }
    };

    const getCreditsMessage = (credits) => {
        if (credits > 1) return `License is valid. You have <strong>${credits} credits</strong> remaining.`;
        if (credits === 1) return `License is valid. You have <strong>1 credit</strong> remaining.`;
        return `This license has no credits left. <a href="${ETSY_STORE_LINK}" target="_blank">Get a new one to convert more files.</a>`;
    };

    async function recoverSession(key) {
        try {
            const sessionResponse = await fetch(VITE_RECOVER_SESSION_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: key })
            });

            if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                if (sessionData.files && sessionData.files.length > 0) {
                    showDownloadCenterView(sessionData.files);
                } else {
                    alert('No conversion history found for this license.');
                }
            } else {
                alert('Could not find a recent download session.');
            }
        } catch (error) {
            alert('An error occurred while trying to recover your session.');
        }
    }

    async function validateLicenseWithRetries(key, isSilent = false) {
        if (validationController) validationController.abort();
        validationController = new AbortController();
        const signal = validationController.signal;
        
        if (!isSilent) {
            licenseStatus.className = 'license-status-message checking';
            licenseStatus.textContent = 'Validating...';
        }

        try {
            const response = await fetch(VITE_CHECK_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: key }),
                signal
            });
            if (signal.aborted) return;
            const result = await response.json();
            
            if (response.ok && result.isValid) {
                isLicenseValid = true;
                currentUserState.type = result.user_type;
                currentUserState.credits = result.sessions_remaining;
                if (!isConverting) { // Only set initial credits if not in the middle of converting
                    currentUserState.initialCredits = result.sessions_remaining;
                }
                licenseStatus.className = 'license-status-message valid';
                licenseStatus.innerHTML = getCreditsMessage(result.sessions_remaining);

                if (!isSilent) {
                    const sessionResponse = await fetch(VITE_RECOVER_SESSION_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ licenseKey: key })
                    });

                    if (sessionResponse.ok) {
                        const sessionData = await sessionResponse.json();
                        if (sessionData.files && sessionData.files.length > 0) {
                            sessionRecoveryContainer.innerHTML = `You have previous conversions. <a href="#" id="recover-link"><strong>Go to Download Center.</strong></a>`;
                            sessionRecoveryContainer.classList.remove('hidden');
                            document.getElementById('recover-link').addEventListener('click', (e) => {
                                e.preventDefault();
                                recoverSession(key);
                            });
                        }
                    }
                }
            } else {
                isLicenseValid = false;
                if (!isSilent) {
                    licenseStatus.className = 'license-status-message invalid';
                    licenseStatus.innerHTML = result.message || 'Invalid license key.';
                }
            }
        } catch (error) {
            if (signal.aborted) return;
            isLicenseValid = false;
            if (!isSilent) {
                licenseStatus.className = 'license-status-message invalid';
                licenseStatus.textContent = 'A server error occurred while validating the license.';
            }
        } finally {
            if (!signal.aborted) {
                checkLicenseAndToggleUI();
            }
        }
    }

    const handleDrop = (e) => { e.preventDefault(); if (dropZone.classList.contains('disabled')) return; dropZone.classList.remove('dragover'); processFiles(e.dataTransfer.files); };
    const handleFileSelect = (e) => processFiles(e.target.files);

    const checkLicenseAndToggleUI = () => {
        const creditsAvailable = currentUserState.credits - uploadedFiles.filter(f => f.status !== 'error').length;
        const isDropZoneLocked = !isLicenseValid || creditsAvailable <= 0 || isConverting || allConversionsComplete;
        
        dropZone.classList.toggle('disabled', isDropZoneLocked);
        
        if ((isLicenseValid && currentUserState.credits <= 0 && !isConverting) || allConversionsComplete) {
            getLicenseLinkContainer.classList.add('hidden');
        } else {
            getLicenseLinkContainer.classList.remove('hidden');
        }

        if (!isLicenseValid) {
            dropZone.title = 'Please enter a valid license key to upload files.';
            activationNotice.style.display = 'block';
            activationNotice.textContent = 'Converter locked – enter license key above.';
            dropZoneText.innerHTML = '<strong>Drag & drop your Procreate file here</strong>';
            dropZoneLimits.textContent = 'or click to upload';
        } else if (isConverting) {
            dropZone.title = 'Conversion in progress...';
            activationNotice.style.display = 'none';
            dropZoneText.innerHTML = '<strong>Processing your files...</strong>';
            dropZoneLimits.textContent = 'Please wait for all conversions to complete.';
        } else if (allConversionsComplete) {
            dropZone.title = 'Conversions complete.';
            activationNotice.style.display = 'none';
            dropZoneText.innerHTML = '<strong>All conversions are complete.</strong>';
            dropZoneLimits.textContent = "Click 'Go to Downloads' to get your files.";
        } else if (currentUserState.credits <= 0) {
            dropZone.title = 'This license has no credits remaining.';
            activationNotice.style.display = 'block';
            activationNotice.textContent = 'No credits remaining on this license.';
            dropZoneText.innerHTML = '<strong>No credits remaining</strong>';
            dropZoneLimits.textContent = 'Please get a new license to convert more files.';
        } else if (creditsAvailable <= 0) {
            dropZone.title = 'You have used all available slots for your credits.';
            activationNotice.style.display = 'none';
            dropZoneText.innerHTML = '<strong>Your queue is full.</strong>';
            dropZoneLimits.textContent = 'You are using all your available credits.';
        } else {
            dropZone.title = '';
            activationNotice.style.display = 'none';
            if (currentUserState.type === 'multi_credit') {
                const moreText = uploadedFiles.length > 0 ? ' more' : '';
                const limit = Math.min(creditsAvailable, MAX_MULTI_UPLOAD - uploadedFiles.length);
                dropZoneText.innerHTML = `<strong>Drop up to ${limit}${moreText} .brushset files</strong>`;
                dropZoneLimits.textContent = `or click to upload (You have ${creditsAvailable} credits remaining)`;
                fileUploadLabel.textContent = 'Upload Your .brushset Files';
            } else {
                dropZoneText.innerHTML = '<strong>Drop a single .brushset file here</strong>';
                dropZoneLimits.textContent = 'or click to upload (1 credit will be used)';
                fileUploadLabel.textContent = 'Upload Your .brushset File';
            }
        }

        convertButton.disabled = !((isLicenseValid && uploadedFiles.length > 0 && !isConverting) || allConversionsComplete);
        
        if (currentUserState.type === 'multi_credit') {
            fileInput.setAttribute('multiple', 'true');
        } else {
            fileInput.removeAttribute('multiple');
        }
    };

    const processFiles = (files) => {
        dropZoneError.style.display = 'none';
        dropZoneError.textContent = '';
        const filesToAdd = Array.from(files);
        const creditsAvailable = currentUserState.credits - uploadedFiles.filter(f => f.status !== 'error').length;
        
        if (filesToAdd.length > creditsAvailable) {
            dropZoneError.textContent = `Error: This would exceed your credit limit. You have ${creditsAvailable} credits remaining.`;
            dropZoneError.style.display = 'block';
            return;
        }

        if (currentUserState.type === 'single_credit' && (uploadedFiles.length + filesToAdd.length) > 1) {
            dropZoneError.textContent = 'Error: Please upload only one file at a time with a single-credit license.';
            dropZoneError.style.display = 'block';
            return;
        }
        if (currentUserState.type === 'multi_credit' && (uploadedFiles.length + filesToAdd.length) > MAX_MULTI_UPLOAD) {
            dropZoneError.textContent = `Error: You can only queue a maximum of ${MAX_MULTI_UPLOAD} files at a time.`;
            dropZoneError.style.display = 'block';
            return;
        }
        
        for (const file of filesToAdd) {
            // --- NECESSARY CHANGE #1: ADD FILE SIZE VALIDATION HERE ---
            if (file.size > MAX_FILE_SIZE) {
                dropZoneError.textContent = `Error: "${file.name}" is too large. The maximum file size is 35MB.`;
                dropZoneError.style.display = 'block';
                continue; // Skip this oversized file
            }
            // --------------------------------------------------------

            if (file.name.endsWith('.brushset')) {
                uploadedFiles.push({ file: file, status: 'queued', downloadUrl: '', originalFilename: '', message: '' });
            } else {
                // This alert is fine, but using the dropZoneError would be more consistent
                dropZoneError.textContent = `Invalid file type: "${file.name}". Only .brushset files are allowed.`;
                dropZoneError.style.display = 'block';
            }
        }
        updateFileList();
        checkLicenseAndToggleUI();
    };

    const updateFileList = () => {
        fileList.innerHTML = '';
        if (uploadedFiles.length === 0) {
            fileList.classList.add('hidden');
            return;
        }
        fileList.classList.remove('hidden');
        uploadedFiles.forEach((fileData, index) => {
            const listItem = document.createElement('li');
            listItem.id = `file-item-${index}`;
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            
            const fileName = fileData.file ? fileData.file.name : fileData.originalFilename;
            const fileSize = fileData.file ? `(${(fileData.file.size / 1024 / 1024).toFixed(2)} MB)` : '';
            fileInfo.innerHTML = `<span>${fileName} ${fileSize}</span>`;

            const statusContainer = document.createElement('div');
            statusContainer.className = 'status-container';
            const statusBadge = document.createElement('span');
            statusBadge.className = `file-status ${fileData.status}`;
            
            const progressBar = document.createElement('div');
            progressBar.className = 'queue-progress-bar';
            progressBar.innerHTML = `<div class="queue-progress-fill"></div>`;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove file';
            removeBtn.onclick = () => removeFile(index);
            
            if (fileData.status === 'queued' || fileData.status === 'error') {
                removeBtn.style.display = 'block';
            } else {
                removeBtn.style.display = 'none';
            }

            statusContainer.appendChild(statusBadge);
            statusContainer.appendChild(progressBar);
            listItem.appendChild(fileInfo);
            listItem.appendChild(statusContainer);
            listItem.appendChild(removeBtn);
            fileList.appendChild(listItem);

            updateFileStatusUI(index, fileData.status, 0, fileData.message);
        });
    };

    const removeFile = (indexToRemove) => {
        uploadedFiles.splice(indexToRemove, 1);
        fileInput.value = '';
        dropZoneError.style.display = 'none';
        updateFileList();
        checkLicenseAndToggleUI();
    };

    async function handleBatchConversion() {
        isConverting = true;
        sessionRecoveryContainer.classList.add('hidden');
        checkLicenseAndToggleUI();
        updateFileList();
        convertButton.textContent = 'Converting... Please Wait';
        
        let successfulConversionCount = 0;

        for (let i = 0; i < uploadedFiles.length; i++) {
            const fileData = uploadedFiles[i];
            if (fileData.status !== 'queued') continue;
            updateFileStatusUI(i, 'converting', 0);
            try {
                const result = await convertSingleFile(fileData.file, i);
                fileData.status = 'completed';
                fileData.downloadUrl = result.downloadUrl;
                fileData.originalFilename = result.originalFilename;
                updateFileStatusUI(i, 'completed', 100);
                successfulConversionCount++;
                
                await validateLicenseWithRetries(licenseKeyInput.value.trim(), true);

            } catch (error) {
                fileData.status = 'error';
                fileData.message = error.message;
                updateFileStatusUI(i, 'error', 0, error.message);
            }
        }
        
        isConverting = false;
        
        if (successfulConversionCount > 0) {
            allConversionsComplete = true;
            convertButton.textContent = 'Go to Downloads';
        } else {
            // --- NECESSARY CHANGE #2: REMOVE GENERIC ALERT ---
            // The specific error is already shown in the file list.
            // alert("All conversions failed. Please check the errors and try again.");
            // ------------------------------------------------
        }
        
        checkLicenseAndToggleUI();
        updateFileList();
    }

    function convertSingleFile(file, index) {
        return new Promise((resolve, reject) => {
            const licenseKey = licenseKeyInput.value.trim();
            const formData = new FormData();
            formData.append('licenseKey', licenseKey);
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', VITE_CONVERT_API_ENDPOINT, true);
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const uploadProgress = 10 + (event.loaded / event.total) * 80;
                    updateFileStatusUI(index, 'converting', uploadProgress);
                }
            };
            xhr.onload = () => {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        updateFileStatusUI(index, 'converting', 100);
                        resolve(result);
                    } else {
                        // --- NECESSARY CHANGE #3: IMPROVE ERROR HANDLING ---
                        // Use the specific error message from the backend.
                        reject(new Error(result.message || 'An unknown server error occurred.'));
                        // ----------------------------------------------------
                    }
                } catch (e) {
                    reject(new Error('An unexpected server response was received.'));
                }
            };
            xhr.onerror = () => {
                reject(new Error('A network error occurred. Please check your connection.'));
            };
            updateFileStatusUI(index, 'converting', 10);
            xhr.send(formData);
        });
    }

    function updateFileStatusUI(index, status, progress, message = '') {
        const listItem = document.getElementById(`file-item-${index}`);
        if (!listItem) return;
        const statusBadge = listItem.querySelector('.file-status');
        const progressBar = listItem.querySelector('.queue-progress-bar');
        const progressBarFill = listItem.querySelector('.queue-progress-fill');
        statusBadge.className = `file-status ${status}`;
        progressBar.style.display = 'none';
        
        if (status === 'converting') {
            statusBadge.textContent = 'Converting...';
            progressBar.style.display = 'block';
            progressBarFill.style.width = `${progress}%`;
        } else if (status === 'completed') {
            statusBadge.textContent = 'Ready';
            progressBar.style.display = 'none';
        } else if (status === 'error') {
            statusBadge.textContent = 'Error';
            listItem.title = message;
        } else {
            statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }

    // --- VIEW SWITCHING LOGIC ---
    function showView(viewToShow) {
        appTool.classList.add('hidden');
        singleDownloadView.classList.add('hidden');
        batchDownloadView.classList.add('hidden');
        downloadCenterView.classList.add('hidden');
        viewToShow.classList.remove('hidden');
    }

    const showSingleDownloadView = (fileData) => {
        showView(singleDownloadView);
        singleDownloadFilename.textContent = fileData.originalFilename;
        singleDownloadBtn.onclick = () => {
            triggerDownload(fileData.downloadUrl, fileData.originalFilename);
        };
    };

    const showBatchDownloadView = (files) => {
        showView(batchDownloadView);
        batchDownloadList.innerHTML = '';
        files.forEach(fileData => {
            const listItem = document.createElement('li');
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = fileData.originalFilename;
            listItem.appendChild(filenameSpan);

            const downloadLink = document.createElement('a');
            downloadLink.className = 'status-badge active';
            downloadLink.textContent = 'Download';
            downloadLink.onclick = () => {
                triggerDownload(fileData.downloadUrl, fileData.originalFilename);
            };
            listItem.appendChild(downloadLink);
            batchDownloadList.appendChild(listItem);
        });
        downloadAllBatchBtn.style.display = files.length > 1 ? 'inline-block' : 'none';
    };


    const showDownloadCenterView = (files) => {
        showView(downloadCenterView);
        downloadCenterList.innerHTML = '';

        files.forEach(fileData => {
            const listItem = document.createElement('li');
            
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = fileData.originalFilename;
            listItem.appendChild(filenameSpan);

            const statusDiv = document.createElement('div');
            statusDiv.className = 'download-status-container';

            const expirySpan = document.createElement('span');
            expirySpan.className = 'expiry-info';
            
            if (fileData.status === 'active') {
                const { text, className } = formatExpiryTime(fileData.createdAt);
                expirySpan.textContent = text;
                expirySpan.className = `expiry-info ${className}`;
                statusDiv.appendChild(expirySpan);

                const downloadLink = document.createElement('a');
                downloadLink.className = 'status-badge active';
                downloadLink.textContent = 'Download';
                downloadLink.onclick = () => {
                    triggerDownload(fileData.downloadUrl, fileData.originalFilename);
                };
                statusDiv.appendChild(downloadLink);
            } else {
                const { text } = formatExpiryTime(fileData.createdAt, true);
                expirySpan.textContent = `Converted on ${text}`;
                statusDiv.appendChild(expirySpan);

                const expiredBadge = document.createElement('span');
                expiredBadge.className = 'status-badge expired';
                expiredBadge.textContent = 'Expired';
                statusDiv.appendChild(expiredBadge);
            }
            
            listItem.appendChild(statusDiv);
            downloadCenterList.appendChild(listItem);
        });
    };

    // --- HELPER FUNCTIONS ---
    const triggerDownload = (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    async function handleDownloadAllBatch() {
        const successfulFiles = uploadedFiles.filter(f => f.status === 'completed');
        if (successfulFiles.length < 2) return;

        const downloadUrls = successfulFiles.map(file => file.downloadUrl);
        
        downloadAllBatchBtn.textContent = 'Zipping...';
        downloadAllBatchBtn.disabled = true;

        try {
            const response = await fetch(VITE_DOWNLOAD_ALL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: downloadUrls }),
            });

            if (!response.ok) throw new Error('Failed to create ZIP file.');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers.get('content-disposition');
            let downloadName = 'ArtyPacks.app_Batch.zip';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
                if (filenameMatch && filenameMatch.length > 1) {
                    downloadName = filenameMatch[1];
                }
            }
            
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Download All Error:', error);
            alert(`Could not download all files: ${error.message}`);
        } finally {
            downloadAllBatchBtn.textContent = 'Download All as .ZIP';
            downloadAllBatchBtn.disabled = false;
        }
    }

    const formatExpiryTime = (createdAt, isExpired = false) => {
        const conversionTime = new Date(createdAt);
        const expiryTime = new Date(conversionTime.getTime() + 60 * 60 * 1000);
        const now = new Date();
        const diffMinutes = (expiryTime - now) / (1000 * 60);

        const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
        const formattedDate = conversionTime.toLocaleDateString(undefined, options);

        if (isExpired || diffMinutes <= 0) {
            return { text: formattedDate, className: 'expired' };
        }

        if (diffMinutes < 5) {
            return { text: `Expires in ${Math.floor(diffMinutes)}m`, className: 'danger' };
        }
        if (diffMinutes < 15) {
            return { text: `Expires in ${Math.floor(diffMinutes)}m`, className: 'warn' };
        }
        return { text: `Expires in ${Math.floor(diffMinutes)}m`, className: 'safe' };
    };

    const partialReset = () => {
        showView(appTool);
        
        uploadedFiles = [];
        isConverting = false;
        allConversionsComplete = false;
        fileInput.value = '';
        
        // Re-validate the license to show the updated credit count and history link
        validateLicenseWithRetries(licenseKeyInput.value.trim());
        updateFileList();
    };

    // --- START THE APP ---
    initializeApp();
});
