// jspdf-initializer.js
console.log("jsPDF initializer starting...");

try {
    // Patch jsPDF onto window.jsPDF manually
    if (window.jspdf && window.jspdf.jsPDF) {
        window.jsPDF = window.jspdf.jsPDF;
        console.log("jsPDF manually patched onto window.jsPDF");

        // Now manually patch AutoTable if available
        if (window.jspdf && window.jspdf.AutoTable) {
            console.log("AutoTable detected on window.jspdf");
            window.jsPDF.API.autoTable = window.jspdf.AutoTable;
            console.log("AutoTable manually patched onto jsPDF.API");
        } else {
            console.warn("AutoTable plugin not found in window.jspdf");
        }
    } else {
        console.error("UMD jsPDF bundle not found on window.jspdf.jsPDF");
    }
} catch (e) {
    console.error("Error patching jsPDF or AutoTable", e);
}

// Global flag to track library status
window.jsPDFLoaded = false;
window.jsPDFAutoTableLoaded = false;

// Function to check if libraries are loaded and set flags
function checkLibraries() {
  if (typeof jsPDF !== 'undefined') {
    console.log("jsPDF loaded successfully, version:", jsPDF.version);
    window.jsPDFLoaded = true;
    
    try {
      const testPdf = new jsPDF();
      
      if (typeof testPdf.autoTable === 'function') {
        console.log("jsPDF AutoTable plugin loaded successfully");
        window.jsPDFAutoTableLoaded = true;
      } else {
        console.error("jsPDF loaded but AutoTable plugin is missing");
      }
    } catch (err) {
      console.error("Error creating test jsPDF instance:", err);
    }
  } else {
    console.error("jsPDF is not defined");
  }
}

// Run initial check immediately
checkLibraries();

// Expose manual checker
window.verifyJsPDF = function() {
  checkLibraries();
  return {
    jsPDFAvailable: window.jsPDFLoaded,
    autoTableAvailable: window.jsPDFAutoTableLoaded
  };
};

console.log("jsPDF initializer completed");
