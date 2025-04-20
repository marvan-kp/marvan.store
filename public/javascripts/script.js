$(document).ready(function () {
  function addToCart(proId) {
    $.ajax({
      url: '/add-to-cart/' + proId,
      method: 'get',
      success: (response) => {
        console.log('Add to cart response:', response);
        if (response.status === true) {
          $("#cart-count").html(response.cartCount); // Update with server-provided count
        } else {
          console.error('Add to cart failed:', response.error);
          alert('Failed to add item to cart. Please try again.');
        }
      },
      error: (xhr, status, error) => {
        console.error('AJAX error:', error);
        alert('An error occurred. Please check the console for details.');
      }
    });
  }

  $('.btn-primary[onclick^="addToCart"]').each(function () {
    const proId = $(this).attr('onclick').match(/addToCart\('([^']+)'\)/)[1];
    $(this).off('click').on('click', function (e) {
      e.preventDefault();
      addToCart(proId);
    });
  });
});