document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const VITE_CONVERT_API_ENDPOINT = "https://artypacks-backend-prod.onrender.com/convert";
    const VITE_CHECK_API_ENDPOINT = "https://artypacks-backend-prod.onrender.com/check-license";
    const VITE_RECOVER_SESSION_ENDPOINT = "https://artypacks-backend-prod.onrender.com/recover-session";
    const VITE_DOWNLOAD_ALL_ENDPOINT = "https://artypacks-backend-prod.onrender.com/download-all";
    const ETSY_STORE_LINK = 'https://www.etsy.com/shop/artypacks';
    const MAX_MULTI_UPLOAD = 10;

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
    const fileUploadLabel = document.getElementById('file-upload-label');
    const dropZoneText = document.getElementById('drop-zone-text');
    const dropZoneLimits = document.getElementById('drop-zone-limits');
    const dropZoneError = document.getElementById('drop-zone-error');

    // View Selectors
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
    let batchDownloadCounter = 0;
    let currentUserState = { type: 'none', credits: 0, initialCredits: 0 };
    let displayedCredits = 0;
    let downloadCenterFiles = [];

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

        // Button Listeners
        convertAnotherSingleBtn.addEventListener('click', resetApp);
        convertAnotherBatchBtn.addEventListener('click', resetApp);
        backToConverterCenterBtn.addEventListener('click', resetApp);
        downloadAllBatchBtn.addEventListener('click', handleDownloadAllBatch);

        // Accordion and Contact Form
        setupAccordion();
        setupContactForm();
    };

    // --- CORE FUNCTIONS ---
    const handleConversionOrNavigation = () => {
        if (allConversionsComplete) {
            recoverSession(licenseKeyInput.value.trim(), true); // Force show Download Center
        } else {
            handleBatchConversion();
        }
    };

    const handleLicenseInput = () => {
        if (validationController) validationController.abort();
        isLicenseValid = false;
        currentUserState = { type: 'none', credits: 0, initialCredits: 0 };
        displayedCredits = 0;
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

    async function validateLicenseWithRetries(key) {
        if (validationController) validationController.abort();
        validationController = new AbortController();
        const signal = validationController.signal;
        licenseStatus.className = 'license-status-message checking';
        licenseStatus.textContent = 'Validating...';
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
                currentUserState.initialCredits = result.sessions_remaining;
                displayedCredits = result.sessions_remaining;
                licenseStatus.className = 'license-status-message valid';
                licenseStatus.innerHTML = getCreditsMessage(displayedCredits);

                // Check for existing session to show recovery link
                recoverSession(key, false); // false = don't show view yet

            } else {
                isLicenseValid = false;
                licenseStatus.className = 'license-status-message invalid';
                licenseStatus.innerHTML = result.message || 'Invalid license key.';
            }
        } catch (error) {
            if (signal.aborted) return;
            isLicenseValid = false;
            licenseStatus.className = 'license-status-message invalid';
            licenseStatus.textContent = 'A server error occurred while validating the license.';
        } finally {
            if (!signal.aborted) {
                checkLicenseAndToggleUI();
            }
        }
    }

    async function recoverSession(key, showView) {
        try {
            const sessionResponse = await fetch(VITE_RECOVER_SESSION_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey: key })
            });

            if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                if (sessionData.files && sessionData.files.length > 0) {
                    downloadCenterFiles = sessionData.files;
                    if (showView) {
                        showDownloadCenterView();
                    } else if (!isConverting && !allConversionsComplete) {
                        sessionRecoveryContainer.innerHTML = `You have recent downloads. <a href="#" id="recover-link"><strong>View your Download Center.</strong></a>`;
                        sessionRecoveryContainer.classList.remove('hidden');
                        document.getElementById('recover-link').addEventListener('click', (e) => {
                            e.preventDefault();
                            showDownloadCenterView();
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Session recovery failed:', error);
        }
    }

    const handleDrop = (e) => { e.preventDefault(); if (dropZone.classList.contains('disabled')) return; dropZone.classList.remove('dragover'); processFiles(e.dataTransfer.files); };
    const handleFileSelect = (e) => processFiles(e.target.files);

    const checkLicenseAndToggleUI = () => {
        const creditsAvailable = displayedCredits;
        const isDropZoneLocked = !isLicenseValid || creditsAvailable <= 0 || isConverting || allConversionsComplete;
        
        dropZone.classList.toggle('disabled', isDropZoneLocked);
        
        if ((isLicenseValid && currentUserState.initialCredits <= 0) || allConversionsComplete) {
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
        } else if (currentUserState.initialCredits <= 0) {
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
        const totalFilesAfterAdd = uploadedFiles.length + filesToAdd.length;
        
        if (totalFilesAfterAdd > displayedCredits) {
            dropZoneError.textContent = `Error: This would exceed your credit limit. You have ${displayedCredits} credits remaining.`;
            dropZoneError.style.display = 'block';
            return;
        }

        if (currentUserState.type === 'single_credit' && totalFilesAfterAdd > 1) {
            dropZoneError.textContent = 'Error: Please upload only one file at a time with a single-credit license.';
            dropZoneError.style.display = 'block';
            return;
        }
        if (currentUserState.type === 'multi_credit' && totalFilesAfterAdd > MAX_MULTI_UPLOAD) {
            dropZoneError.textContent = `Error: You can only queue a maximum of ${MAX_MULTI_UPLOAD} files at a time.`;
            dropZoneError.style.display = 'block';
            return;
        }
        
        for (const file of filesToAdd) {
            if (file.name.endsWith('.brushset')) {
                reserveCredit();
                uploadedFiles.push({ file: file, status: 'queued', downloadUrl: '', originalFilename: '', message: '' });
            } else {
                alert(`Invalid file type: ${file.name}. Only .brushset files are allowed.`);
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
        const fileData = uploadedFiles[indexToRemove];
        if (fileData.status === 'queued' || fileData.status === 'error') {
            refundCredit();
        }
        uploadedFiles.splice(indexToRemove, 1);
        fileInput.value = '';
        dropZoneError.style.display = 'none';
        updateFileList();
        checkLicenseAndToggleUI();
    };

    const reserveCredit = () => {
        if (displayedCredits > 0) {
            displayedCredits--;
        }
    };

    const refundCredit = () => {
        if (displayedCredits < currentUserState.initialCredits) {
            displayedCredits++;
        }
    };

    async function handleBatchConversion() {
        isConverting = true;
        sessionRecoveryContainer.classList.add('hidden');
        checkLicenseAndToggleUI();
        updateFileList();
        convertButton.textContent = 'Converting... Please Wait';
        
        let successfulConversions = [];

        for (let i = 0; i < uploadedFiles.length; i++) {
            const fileData = uploadedFiles[i];
            if (fileData.status !== 'queued') continue;
            fileData.status = 'converting';
            updateFileStatusUI(i, 'converting', 0);
            try {
                const result = await convertSingleFile(fileData.file, i);
                fileData.status = 'completed';
                fileData.downloadUrl = result.downloadUrl;
                fileData.originalFilename = result.originalFilename;
                updateFileStatusUI(i, 'completed', 100);
                
                successfulConversions.push(result);
                currentUserState.initialCredits--;
                licenseStatus.innerHTML = getCreditsMessage(currentUserState.initialCredits);

            } catch (error) {
                fileData.status = 'error';
                fileData.message = error.message;
                updateFileStatusUI(i, 'error', 0, error.message);
                refundCredit();
            }
        }
        
        isConverting = false;
        
        if (successfulConversions.length > 0) {
            allConversionsComplete = true;
            if (currentUserState.type === 'single_credit') {
                showSingleDownloadView(successfulConversions[0]);
            } else {
                showBatchDownloadView(successfulConversions);
            }
        } else {
            alert("All conversions failed. Your credits have been refunded. Please check the errors and try again.");
            checkLicenseAndToggleUI();
            updateFileList();
        }
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
                        reject(new Error(result.message || 'An unknown error occurred.'));
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

    const showSingleDownloadView = (fileData) => {
        appTool.classList.add('hidden');
        singleDownloadView.classList.remove('hidden');
        singleDownloadFilename.textContent = fileData.originalFilename;
        singleDownloadBtn.onclick = () => {
            triggerDownload(fileData.downloadUrl, fileData.originalFilename);
        };
    };

    const showBatchDownloadView = (files) => {
        appTool.classList.add('hidden');
        batchDownloadView.classList.remove('hidden');
        batchDownloadList.innerHTML = '';
        files.forEach(fileData => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span class="filename">${fileData.originalFilename}</span>
                <a class="status-badge active">Download</a>
            `;
            listItem.querySelector('a').onclick = () => {
                triggerDownload(fileData.downloadUrl, fileData.originalFilename);
            };
            batchDownloadList.appendChild(listItem);
        });
        downloadAllBatchBtn.style.display = files.length > 1 ? 'inline-block' : 'none';
    };

    const showDownloadCenterView = () => {
        appTool.classList.add('hidden');
        singleDownloadView.classList.add('hidden');
        batchDownloadView.classList.add('hidden');
        downloadCenterView.classList.remove('hidden');
        downloadCenterList.innerHTML = '';

        downloadCenterFiles.forEach(fileData => {
            const listItem = document.createElement('li');
            
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = fileData.originalFilename;
            listItem.appendChild(filenameSpan);

            const actionContainer = document.createElement('div');
            actionContainer.className = 'download-action';

            if (fileData.status === 'active') {
                const expiryInfo = document.createElement('span');
                const { text, urgency } = formatExpiryTime(fileData.createdAt);
                expiryInfo.className = `expiry-info ${urgency}`;
                expiryInfo.textContent = text;
                actionContainer.appendChild(expiryInfo);

                const downloadLink = document.createElement('a');
                downloadLink.className = 'status-badge active';
                downloadLink.textContent = 'Download';
                downloadLink.onclick = () => {
                    triggerDownload(fileData.downloadUrl, fileData.originalFilename);
                };
                actionContainer.appendChild(downloadLink);

            } else { // 'expired'
                const conversionInfo = document.createElement('span');
                conversionInfo.className = 'expiry-info';
                conversionInfo.textContent = `Converted: ${formatExpiryTime(fileData.createdAt, true)}`;
                actionContainer.appendChild(conversionInfo);

                const expiredBadge = document.createElement('span');
                expiredBadge.className = 'status-badge expired';
                expiredBadge.textContent = 'Expired';
                actionContainer.appendChild(expiredBadge);
            }
            
            listItem.appendChild(actionContainer);
            downloadCenterList.appendChild(listItem);
        });
    };

    const triggerDownload = (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        const baseName = filename.replace(/\.brushset$/, '');
        link.download = `ArtyPacks.app_${baseName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetApp = () => {
        if (validationController) validationController.abort();
        
        // Hide all views and show the main tool
        singleDownloadView.classList.add('hidden');
        batchDownloadView.classList.add('hidden');
        downloadCenterView.classList.add('hidden');
        appTool.classList.remove('hidden');

        // Reset state variables
        uploadedFiles = [];
        downloadCenterFiles = [];
        isConverting = false;
        allConversionsComplete = false;
        fileInput.value = '';
        licenseKeyInput.disabled = false;
        licenseKeyInput.value = '';
        licenseStatus.innerHTML = '';
        isLicenseValid = false;
        currentUserState = { type: 'none', credits: 0, initialCredits: 0 };
        displayedCredits = 0;
        
        // Reset UI elements
        updateFileList();
        checkLicenseAndToggleUI();
        sessionRecoveryContainer.classList.add('hidden');
        sessionRecoveryContainer.innerHTML = '';
    };

    async function handleDownloadAllBatch() {
        const activeFiles = uploadedFiles.filter(f => f.status === 'completed');
        if (activeFiles.length < 2) return;

        const downloadUrls = activeFiles.map(file => file.downloadUrl);
        
        batchDownloadCounter++;
        downloadAllBatchBtn.textContent = 'Zipping...';
        downloadAllBatchBtn.disabled = true;

        try {
            const response = await fetch(VITE_DOWNLOAD_ALL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenseKey: licenseKeyInput.value.trim(),
                    urls: downloadUrls,
                    batchCounter: batchDownloadCounter
                }),
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || 'Failed to create ZIP file.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers.get('content-disposition');
            let downloadName;
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                  downloadName = matches[1].replace(/['"]/g, '');
                }
            }
            
            link.download = downloadName || `ArtyPacks.app_Batch_${batchDownloadCounter}.zip`;
            
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

    // --- HELPER FUNCTIONS ---
    const getCreditsMessage = (credits) => {
        if (credits > 1) return `License is valid. You have <strong>${credits} credits</strong> remaining.`;
        if (credits === 1) return `License is valid. You have <strong>1 credit</strong> remaining.`;
        return `This license has no credits left. <a href="${ETSY_STORE_LINK}" target="_blank">Get a new one to convert more files.</a>`;
    };

    const formatExpiryTime = (utcTimestamp, isStatic = false) => {
        const date = new Date(utcTimestamp);
        
        if (isStatic) { // For "Converted: ..." text
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        }

        const expiryTime = new Date(date.getTime() + 60 * 60 * 1000);
        const now = new Date();
        const minutesLeft = Math.round((expiryTime - now) / (1000 * 60));

        let urgency = 'safe';
        if (minutesLeft < 5) urgency = 'danger';
        else if (minutesLeft < 15) urgency = 'warn';

        const timeString = expiryTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const dateString = expiryTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        let text = `Expires in ${minutesLeft} min`;
        if (minutesLeft < 1) {
            text = 'Expires in <1 min';
        }
        
        return { text, urgency, full_timestamp: `${dateString}, ${timeString}` };
    };

    const setupAccordion = () => {
        document.querySelectorAll('.accordion-question, .footer-accordion-trigger').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                const item = e.currentTarget.closest('.accordion-item, .footer-accordion-item');
                if (item) item.classList.toggle('open');
            });
        });
    };

    const setupContactForm = () => {
        const contactForm = document.getElementById('contact-form');
        if (!contactForm) return;
        const formStatus = document.getElementById('form--status');
        
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(contactForm);
            
            try {
                const response = await fetch(contactForm.action, { 
                    method: 'POST', 
                    body: formData, 
                    headers: { 'Accept': 'application/json' } 
                });
                
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
    };

    // --- START THE APP ---
    initializeApp();
});
